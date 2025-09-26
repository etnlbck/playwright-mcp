import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium, type Browser, type Page, type PageScreenshotOptions } from "playwright";
import { z } from "zod";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const NavigateArgsSchema = z.object({
  url: z.string().url(),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
  timeout: z.number().optional(),
});

const ScreenshotArgsSchema = z.object({
  fullPage: z.boolean().optional(),
  quality: z.number().min(0).max(100).optional(),
  type: z.enum(["png", "jpeg"]).optional(),
  maxSize: z.number().optional().describe("Maximum size in bytes (default: 5MB)"),
  compress: z.boolean().optional().describe("Auto-compress if too large (default: true)"),
  saveToFile: z.boolean().optional().describe("Save to file instead of returning base64 (default: false)"),
});

const ScrapeArgsSchema = z.object({
  selector: z.string().optional(),
  attribute: z.string().optional(),
  multiple: z.boolean().optional(),
});

const ClickArgsSchema = z.object({
  selector: z.string(),
  timeout: z.number().optional(),
});

const TypeArgsSchema = z.object({
  selector: z.string(),
  text: z.string(),
  delay: z.number().optional(),
});

const WaitForArgsSchema = z.object({
  selector: z.string().optional(),
  timeout: z.number().optional(),
  state: z.enum(["attached", "detached", "visible", "hidden"]).optional(),
});

// Assertion template schemas
const AssertionConditionSchema = z.object({
  type: z.enum([
    "page_title",
    "page_url",
    "visible",
    "attached",
    "hidden",
    "detached",
    "text",
    "attribute",
    "count",
    "css",
    "value",
    "checked",
    "enabled",
    "in_viewport",
  ]),
  selector: z.string().optional(),
  attribute: z.string().optional(),
  name: z.string().optional(), // CSS property name
  expected: z.any().optional(),
  contains: z.string().optional(),
  regex: z.string().optional(),
  flags: z.string().optional(),
  count: z.number().optional(),
  comparator: z.enum(["equals", "contains", "matches", "gt", "gte", "lt", "lte"]).optional(),
  timeout: z.number().optional(),
  ratio: z.number().optional(),
});

const AssertTemplateArgsSchema = z.object({
  navigate: z.object({
    url: z.string().url(),
    waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
    timeout: z.number().optional(),
  }).optional(),
  assertions: z.array(AssertionConditionSchema).min(1),
});

class PlaywrightMCPServer {
  private server: Server;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private browserAvailable = true;
  private browserLaunchTime = 0;
  private maxBrowserAge = 30 * 60 * 1000; // 30 minutes
  private retryCount = 0;
  private maxRetries = 3;
  // Declaration for late-bound evaluator implementation
  private evaluateAssertionTemplate!: (page: Page, assertions: AssertionCondition[]) => Promise<AssertionSummary>;

  constructor() {
    this.server = new Server(
      {
        name: "playwright-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupProcessHandlers();
  }

  private setupProcessHandlers(): void {
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('🛑 Received SIGINT, closing browser...');
      await this.cleanup();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('🛑 Received SIGTERM, closing browser...');
      await this.cleanup();
      process.exit(0);
    });
  }

  async cleanup(): Promise<void> {
    try {
      if (this.browser) {
        console.log('🌐 Closing browser...');
        await this.browser.close();
        this.browser = null;
        this.page = null;
        console.log('✅ Browser closed successfully');
      }
    } catch (error) {
      console.error('❌ Error during browser cleanup:', error);
    }
  }

  private async ensureBrowser(): Promise<void> {
    // Check if browser needs to be recycled due to age
    if (this.browser && this.browserLaunchTime > 0) {
      const browserAge = Date.now() - this.browserLaunchTime;
      if (browserAge > this.maxBrowserAge) {
        console.log(`🔄 Browser is ${Math.round(browserAge / 1000)}s old, recycling...`);
        await this.cleanup();
      }
    }

    if (!this.browser) {
      console.log("🔧 Launching Chromium browser...");
      console.log(`Platform: ${process.platform}, Arch: ${process.arch}`);
      console.log(`Memory: ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB available`);
      
      const startTime = Date.now();
      try {
        this.browser = await chromium.launch({
          headless: true,
          args: [
            "--no-sandbox", 
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-web-security",
            "--disable-features=VizDisplayCompositor",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-extensions",
            "--disable-plugins",
            "--disable-default-apps",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-networking",
            "--disable-sync",
            "--memory-pressure-off",
            "--max_old_space_size=4096",
            "--disable-blink-features=AutomationControlled",
            "--disable-features=VizDisplayCompositor,TranslateUI",
            "--disable-ipc-flooding-protection",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
            "--disable-client-side-phishing-detection",
            "--disable-component-extensions-with-background-pages",
            "--disable-default-apps",
            "--disable-hang-monitor",
            "--disable-prompt-on-repost",
            "--disable-sync",
            "--metrics-recording-only",
            "--no-first-run",
            "--safebrowsing-disable-auto-update",
            "--enable-automation",
            "--password-store=basic",
            "--use-mock-keychain"
          ],
        });
        
        this.browserLaunchTime = Date.now();
        const launchTime = this.browserLaunchTime - startTime;
        console.log(`✅ Chromium browser launched successfully in ${launchTime}ms`);
        
        // Reset retry count on successful launch
        this.retryCount = 0;
        
        // Set up browser event handlers
        this.browser.on('disconnected', () => {
          console.log('🔌 Browser disconnected, will recreate on next request');
          this.browser = null;
          this.page = null;
        });
        
      } catch (error) {
        this.retryCount++;
        console.error(`❌ Failed to launch Chromium browser (attempt ${this.retryCount}/${this.maxRetries}):`, error);
        
        if (this.retryCount >= this.maxRetries) {
          console.error("This might be due to missing system dependencies or insufficient resources");
          console.warn("⚠️ Browser functionality will be disabled, but server will continue running");
          this.browserAvailable = false;
          throw new Error("Browser is not available - server running in degraded mode");
        }
        
        // Wait before retrying
        const waitTime = Math.min(1000 * (2 ** this.retryCount), 10000);
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Recursive retry
        return this.ensureBrowser();
      }
    }
  }

  private async ensurePage(): Promise<Page> {
    // Always try to ensure browser is available for on-demand startup
    await this.ensureBrowser();
    
    if (!this.browser) {
      throw new Error("Browser is not available after ensureBrowser call");
    }
    
    // Check if page is still valid
    if (this.page) {
      try {
        // Test if page is still responsive
        await this.page.url();
        return this.page;
      } catch (error) {
        console.log('🔄 Page is no longer responsive, creating new page...');
        this.page = null;
      }
    }
    
    // Create new page with retry logic
    let attempts = 0;
    const maxPageAttempts = 3;
    
    while (attempts < maxPageAttempts) {
      try {
        this.page = await this.browser.newPage();
        
        // Set reasonable timeouts
        this.page.setDefaultTimeout(30000);
        this.page.setDefaultNavigationTimeout(30000);
        
        console.log('✅ New page created successfully');
        return this.page;
      } catch (error) {
        attempts++;
        console.error(`❌ Failed to create page (attempt ${attempts}/${maxPageAttempts}):`, error);
        
        if (attempts >= maxPageAttempts) {
          throw new Error(`Failed to create page after ${maxPageAttempts} attempts: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }
    
    throw new Error("Failed to create page");
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "navigate",
            description: "Navigate to a URL",
            inputSchema: {
              type: "object",
              properties: {
                url: { type: "string", description: "URL to navigate to" },
                waitUntil: { 
                  type: "string", 
                  enum: ["load", "domcontentloaded", "networkidle"],
                  description: "Wait until condition is met"
                },
                timeout: { type: "number", description: "Timeout in milliseconds" },
              },
              required: ["url"],
            },
          },
          {
            name: "screenshot",
            description: "Take a screenshot of the current page with size management options",
            inputSchema: {
              type: "object",
              properties: {
                fullPage: { type: "boolean", description: "Capture full page" },
                quality: { type: "number", minimum: 0, maximum: 100, description: "JPEG quality" },
                type: { type: "string", enum: ["png", "jpeg"], description: "Image format" },
                maxSize: { type: "number", description: "Maximum size in bytes (default: 5MB)" },
                compress: { type: "boolean", description: "Auto-compress if too large (default: true)" },
                saveToFile: { type: "boolean", description: "Save to file instead of returning base64 (default: false)" },
              },
            },
          },
          {
            name: "scrape",
            description: "Extract text or attributes from elements",
            inputSchema: {
              type: "object",
              properties: {
                selector: { type: "string", description: "CSS selector (optional, defaults to body)" },
                attribute: { type: "string", description: "Attribute to extract (optional, defaults to textContent)" },
                multiple: { type: "boolean", description: "Extract from multiple elements" },
              },
            },
          },
          {
            name: "click",
            description: "Click on an element",
            inputSchema: {
              type: "object",
              properties: {
                selector: { type: "string", description: "CSS selector of element to click" },
                timeout: { type: "number", description: "Timeout in milliseconds" },
              },
              required: ["selector"],
            },
          },
          {
            name: "type",
            description: "Type text into an element",
            inputSchema: {
              type: "object",
              properties: {
                selector: { type: "string", description: "CSS selector of input element" },
                text: { type: "string", description: "Text to type" },
                delay: { type: "number", description: "Delay between keystrokes in milliseconds" },
              },
              required: ["selector", "text"],
            },
          },
          {
            name: "wait_for",
            description: "Wait for an element or condition",
            inputSchema: {
              type: "object",
              properties: {
                selector: { type: "string", description: "CSS selector to wait for" },
                timeout: { type: "number", description: "Timeout in milliseconds" },
                state: { 
                  type: "string", 
                  enum: ["attached", "detached", "visible", "hidden"],
                  description: "Element state to wait for"
                },
              },
            },
          },
          {
            name: "get_url",
            description: "Get the current page URL",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "close_browser",
            description: "Close the browser instance",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "browser_health",
            description: "Check browser health and status",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "browser_status",
            description: "Check browser status without starting it (for health checks)",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "discover_elements",
            description: "Discover elements matching a selector to help resolve conflicts",
            inputSchema: {
              type: "object",
              properties: {
                selector: { type: "string", description: "CSS selector to search for" },
                limit: { type: "number", description: "Maximum number of elements to return (default: 10)" },
              },
              required: ["selector"],
            },
          },
          {
            name: "get_page_title",
            description: "Get the page title safely (handles multiple title elements)",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "assert_template",
            description: "Run custom assertions defined in a template",
            inputSchema: {
              type: "object",
              properties: {
                navigate: {
                  type: "object",
                  properties: {
                    url: { type: "string", description: "URL to navigate to before assertions" },
                    waitUntil: { type: "string", enum: ["load", "domcontentloaded", "networkidle"] },
                    timeout: { type: "number" }
                  }
                },
                assertions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { 
                        type: "string",
                        enum: [
                          "page_title","page_url","visible","attached","hidden","detached","text","attribute","count","css","value","checked","enabled","in_viewport"
                        ]
                      },
                      selector: { type: "string" },
                      attribute: { type: "string" },
                      name: { type: "string" },
                      expected: { },
                      contains: { type: "string" },
                      regex: { type: "string" },
                      flags: { type: "string" },
                      count: { type: "number" },
                      comparator: { type: "string", enum: ["equals","contains","matches","gt","gte","lt","lte"] },
                      timeout: { type: "number" },
                      ratio: { type: "number" },
                    },
                    required: ["type"]
                  }
                }
              },
              required: ["assertions"]
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "navigate": {
            const { url, waitUntil = "load", timeout } = NavigateArgsSchema.parse(args);
            const page = await this.ensurePage();
            const gotoOptions = timeout !== undefined ? { waitUntil, timeout } : { waitUntil };
            await page.goto(url, gotoOptions);
            return {
              content: [{ type: "text", text: `Navigated to ${url}` }],
            };
          }

          case "screenshot": {
            const { 
              fullPage = false, 
              quality, 
              type = "png", 
              maxSize = 5 * 1024 * 1024, // 5MB default
              compress = true,
              saveToFile = false
            } = ScreenshotArgsSchema.parse(args);
            
            const page = await this.ensurePage();
            let screenshotOptions: PageScreenshotOptions = { fullPage, type };
            
            // Start with high quality for initial capture
            if (type === "jpeg" && quality !== undefined) {
              screenshotOptions.quality = quality;
            } else if (type === "jpeg") {
              screenshotOptions.quality = 90; // High quality initially
            }
            
            let screenshot = await page.screenshot(screenshotOptions);
            let currentSize = screenshot.length;
            
            // If screenshot is too large and compression is enabled
            if (currentSize > maxSize && compress) {
              console.log(`📸 Screenshot too large (${Math.round(currentSize / 1024)}KB), attempting compression...`);
              
              // Try different compression levels
              const compressionLevels = type === "jpeg" ? [80, 60, 40, 20] : [0.8, 0.6, 0.4, 0.2];
              
              for (const level of compressionLevels) {
                try {
                  if (type === "jpeg") {
                    screenshotOptions.quality = level;
                  } else {
                    // For PNG, we'll convert to JPEG with quality
                    screenshotOptions.type = "jpeg";
                    screenshotOptions.quality = level * 100;
                  }
                  
                  screenshot = await page.screenshot(screenshotOptions);
                  currentSize = screenshot.length;
                  
                  console.log(`📸 Compressed to ${Math.round(currentSize / 1024)}KB (quality: ${level})`);
                  
                  if (currentSize <= maxSize) {
                    break;
                  }
                } catch (error) {
                  console.log(`⚠️ Compression failed at level ${level}:`, error);
                }
              }
            }
            
            // If still too large, offer file save option
            if (currentSize > maxSize) {
              if (saveToFile) {
                // Save to file and return file path
                const screenshotsDir = join(process.cwd(), 'screenshots');
                if (!existsSync(screenshotsDir)) {
                  mkdirSync(screenshotsDir, { recursive: true });
                }
                
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `screenshot-${timestamp}.${type === "jpeg" ? "jpg" : type}`;
                const filepath = join(screenshotsDir, filename);
                
                writeFileSync(filepath, screenshot);
                
                const httpUrl = `http://localhost:${process.env['PORT'] || 3000}/screenshots/${filename}`;
                return {
                  content: [
                    {
                      type: "text",
                      text: `Screenshot saved to file: ${filepath}\nSize: ${Math.round(currentSize / 1024)}KB\nHTTP URL: ${httpUrl}\nNote: Screenshot was too large (${Math.round(currentSize / 1024)}KB > ${Math.round(maxSize / 1024)}KB) to send directly.`
                    }
                  ],
                };
              } else {
                return {
                  content: [
                    {
                      type: "text",
                      text: `❌ Screenshot too large: ${Math.round(currentSize / 1024)}KB (limit: ${Math.round(maxSize / 1024)}KB)\n\n💡 Suggestions:\n- Use saveToFile: true to save to disk\n- Reduce quality or use JPEG format\n- Take a smaller screenshot (disable fullPage)\n- Increase maxSize parameter`
                    }
                  ],
                };
              }
            }
            
            // Return the screenshot data
            return {
              content: [
                {
                  type: "image",
                  data: screenshot.toString("base64"),
                  mimeType: `image/${type === "jpeg" ? "jpeg" : type}`,
                },
              ],
            };
          }

          case "scrape": {
            const { selector = "body", attribute, multiple = false } = ScrapeArgsSchema.parse(args);
            const page = await this.ensurePage();
            
            try {
            if (selector.includes(":contains")) {
                return {
                  content: [{ type: "text", text: "❌ Invalid selector: :contains pseudo-class is not supported. Use a different strategy such as CSS selectors combined with text filters or the discover_elements tool." }],
                };
              }
              
              if (multiple) {
                const elements = await page.locator(selector).all();
                const results = [];
                for (const element of elements) {
                  const value = attribute 
                    ? await element.getAttribute(attribute)
                    : await element.textContent();
                  results.push(value);
                }
                return {
                  content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
                };
              }
              
              // For single element, check if multiple elements match
              const locator = page.locator(selector);
              const count = await locator.count();
              
              if (count === 0) {
                return {
                  content: [{ type: "text", text: "No elements found matching the selector" }],
                };
              }
              
              if (count > 1) {
                // Get information about all matching elements
                const elementInfo = [];
                for (let i = 0; i < Math.min(count, 10); i++) {
                  const element = locator.nth(i);
                  const tagName = await element.evaluate(el => el.tagName.toLowerCase());
                  const text = await element.textContent();
                  const id = await element.getAttribute('id');
                  const className = await element.getAttribute('class');
                  const dataTestId = await element.getAttribute('data-testid');
                  
                  elementInfo.push({
                    index: i,
                    tagName,
                    text: text?.substring(0, 100) || '',
                    id: id || '',
                    className: className?.substring(0, 50) || '',
                    dataTestId: dataTestId || ''
                  });
                }
                
                const errorMessage = `❌ Scrape failed: Found ${count} elements matching "${selector}". Please use a more specific selector.\n\nMatching elements:\n${elementInfo.map(el => 
                  `${el.index + 1}) <${el.tagName}${el.id ? ` id="${el.id}"` : ''}${el.className ? ` class="${el.className}"` : ''}${el.dataTestId ? ` data-testid="${el.dataTestId}"` : ''}>${el.text ? ` "${el.text}"` : ''}</${el.tagName}>`
                ).join('\n')}\n\n💡 Suggestions:\n- Use a more specific selector (e.g., add an ID or class)\n- Use the "discover_elements" tool to find unique selectors\n- Use multiple: true to get all matching elements\n- Try: ${selector}:first-of-type or ${selector}:nth-child(1)`;
                
                return {
                  content: [{ type: "text", text: errorMessage }],
                };
              }
              
              // Single element found, proceed normally
              const element = locator.first();
              const value = attribute
                ? await element.getAttribute(attribute)
                : await element.textContent();
              return {
                content: [{ type: "text", text: value || "" }],
              };
              
            } catch (error) {
              if (error instanceof Error && error.message?.includes('strict mode violation')) {
                // This shouldn't happen with our new logic, but just in case
                const locator = page.locator(selector);
                const count = await locator.count();
                
                return {
                  content: [{ 
                    type: "text", 
                    text: `❌ Strict mode violation: Found ${count} elements matching "${selector}". Use multiple: true to get all elements or make your selector more specific.` 
                  }],
                };
              }
              throw error;
            }
          }

          case "click": {
            const { selector, timeout } = ClickArgsSchema.parse(args);
            const page = await this.ensurePage();
            const clickOptions = timeout !== undefined ? { timeout } : {};
            
            try {
              await page.locator(selector).click(clickOptions);
              return {
                content: [{ type: "text", text: `Clicked element: ${selector}` }],
              };
            } catch (error: unknown) {
              // Handle strict mode violations (multiple elements found)
              if (error instanceof Error && error.message?.includes('strict mode violation')) {
                const locator = page.locator(selector);
                const count = await locator.count();
                
                // Get information about all matching elements
                const elementInfo = [];
                for (let i = 0; i < Math.min(count, 10); i++) {
                  const element = locator.nth(i);
                  const tagName = await element.evaluate(el => el.tagName.toLowerCase());
                  const text = await element.textContent();
                  const id = await element.getAttribute('id');
                  const className = await element.getAttribute('class');
                  const dataTestId = await element.getAttribute('data-testid');
                  
                  elementInfo.push({
                    index: i,
                    tagName,
                    text: text?.substring(0, 100) || '',
                    id: id || '',
                    className: className?.substring(0, 50) || '',
                    dataTestId: dataTestId || ''
                  });
                }
                
                const errorMessage = `❌ Click failed: Found ${count} elements matching "${selector}". Please use a more specific selector.\n\nMatching elements:\n${elementInfo.map(el => 
                  `${el.index + 1}) <${el.tagName}${el.id ? ` id="${el.id}"` : ''}${el.className ? ` class="${el.className}"` : ''}${el.dataTestId ? ` data-testid="${el.dataTestId}"` : ''}>${el.text ? ` "${el.text}"` : ''}</${el.tagName}>`
                ).join('\n')}\n\n💡 Suggestions:\n- Use a more specific selector (e.g., add an ID or class)\n- Use the "discover_elements" tool to find unique selectors\n- Try clicking by index: ${selector}:nth-child(1)`;
                
                return {
                  content: [{ type: "text", text: errorMessage }],
                };
              }
              
              // Re-throw other errors
              throw error;
            }
          }

          case "type": {
            const { selector, text, delay } = TypeArgsSchema.parse(args);
            const page = await this.ensurePage();
            if (delay !== undefined) {
              await page.locator(selector).type(text, { delay });
            } else {
              await page.locator(selector).fill(text);
            }
            return {
              content: [{ type: "text", text: `Typed "${text}" into ${selector}` }],
            };
          }

          case "wait_for": {
            const { selector, timeout, state = "visible" } = WaitForArgsSchema.parse(args);
            const page = await this.ensurePage();
            if (selector) {
              const waitOptions = timeout !== undefined ? { state, timeout } : { state };
              await page.locator(selector).waitFor(waitOptions);
              return {
                content: [{ type: "text", text: `Waited for ${selector} to be ${state}` }],
              };
            }
            await page.waitForTimeout(timeout || 1000);
            return {
              content: [{ type: "text", text: `Waited for ${timeout || 1000}ms` }],
            };
          }

          case "get_url": {
            const page = await this.ensurePage();
            const url = page.url();
            return {
              content: [{ type: "text", text: url }],
            };
          }

          case "close_browser": {
            if (this.browser) {
              await this.browser.close();
              this.browser = null;
              this.page = null;
            }
            return {
              content: [{ type: "text", text: "Browser closed" }],
            };
          }

          case "browser_health": {
            const healthInfo: Record<string, unknown> = {
              browserAvailable: this.browserAvailable,
              browserConnected: !!this.browser,
              pageConnected: !!this.page,
              browserAge: this.browserLaunchTime > 0 ? Date.now() - this.browserLaunchTime : 0,
              retryCount: this.retryCount,
              memoryUsage: process.memoryUsage(),
              uptime: process.uptime()
            };
            
            if (this.browser) {
              try {
                const pages = this.browser.contexts().flatMap(ctx => ctx.pages());
                healthInfo['pageCount'] = pages.length;
                healthInfo['currentUrl'] = this.page ? await this.page.url() : "No active page";
              } catch (error) {
                healthInfo['browserError'] = error instanceof Error ? error.message : String(error);
              }
            }
            
            return {
              content: [{ type: "text", text: JSON.stringify(healthInfo, null, 2) }],
            };
          }

          case "browser_status": {
            // Check browser status without starting it - safe for health checks
            const statusInfo: Record<string, unknown> = {
              browserAvailable: this.browserAvailable,
              browserConnected: !!this.browser,
              pageConnected: !!this.page,
              browserAge: this.browserLaunchTime > 0 ? Date.now() - this.browserLaunchTime : 0,
              retryCount: this.retryCount,
              memoryUsage: process.memoryUsage(),
              uptime: process.uptime(),
              status: this.browser ? "running" : "not_started"
            };
            
            return {
              content: [{ type: "text", text: JSON.stringify(statusInfo, null, 2) }],
            };
          }

          case "discover_elements": {
            const { selector, limit = 10 } = args as { selector: string; limit?: number };
            const page = await this.ensurePage();
            const locator = page.locator(selector);
            const count = await locator.count();
            
            const elementInfo = [];
            const maxElements = Math.min(count, limit);
            
            for (let i = 0; i < maxElements; i++) {
              const element = locator.nth(i);
              try {
                const tagName = await element.evaluate(el => el.tagName.toLowerCase());
                const text = await element.textContent();
                const id = await element.getAttribute('id');
                const className = await element.getAttribute('class');
                const dataTestId = await element.getAttribute('data-testid');
                const ariaLabel = await element.getAttribute('aria-label');
                const role = await element.getAttribute('role');
                const type = await element.getAttribute('type');
                const href = await element.getAttribute('href');
                
                // Generate suggested selectors
                const suggestions = [];
                if (id) suggestions.push(`#${id}`);
                if (dataTestId) suggestions.push(`[data-testid="${dataTestId}"]`);
                if (className) {
                  const classes = className.split(' ').filter(c => c.trim());
                  if (classes.length > 0) {
                    suggestions.push(`.${classes[0]}`);
                    if (classes.length > 1) {
                      suggestions.push(`.${classes.slice(0, 2).join('.')}`);
                    }
                  }
                }
                if (ariaLabel) suggestions.push(`[aria-label="${ariaLabel}"]`);
                if (role) suggestions.push(`[role="${role}"]`);
                if (type) suggestions.push(`[type="${type}"]`);
                if (href) suggestions.push(`[href="${href}"]`);
                
                elementInfo.push({
                  index: i,
                  tagName,
                  text: text?.substring(0, 200) || '',
                  id: id || '',
                  className: className || '',
                  dataTestId: dataTestId || '',
                  ariaLabel: ariaLabel || '',
                  role: role || '',
                  type: type || '',
                  href: href || '',
                  suggestedSelectors: suggestions.slice(0, 3) // Top 3 suggestions
                });
              } catch (error) {
                elementInfo.push({
                  index: i,
                  error: error instanceof Error ? error.message : String(error)
                });
              }
            }
            
            const result = {
              selector,
              totalFound: count,
              elementsReturned: maxElements,
              elements: elementInfo
            };
            
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          case "get_page_title": {
            const page = await this.ensurePage();
            
            try {
              // Try to get the main page title from head > title
              const mainTitle = await page.locator('head > title').first().textContent();
              if (mainTitle) {
                return {
                  content: [{ type: "text", text: mainTitle }],
                };
              }
              
              // Fallback: look for any title element
              const titleElements = await page.locator('title').all();
              if (titleElements.length > 0) {
                const titles = [];
                for (const element of titleElements) {
                  const text = await element.textContent();
                  if (text) titles.push(text);
                }
                
                if (titles.length === 1) {
                  return {
                    content: [{ type: "text", text: titles[0] }],
                  };
                } else {
                  return {
                    content: [{ 
                      type: "text", 
                      text: `Found ${titles.length} title elements:\n${titles.map((t, i) => `${i + 1}) ${t}`).join('\n')}\n\nUsing first title: ${titles[0]}` 
                    }],
                  };
                }
              }
              
              // No title found
              return {
                content: [{ type: "text", text: "No page title found" }],
              };
              
            } catch (error) {
              return {
                content: [{ 
                  type: "text", 
                  text: `Error getting page title: ${error instanceof Error ? error.message : String(error)}` 
                }],
              };
            }
          }

          case "assert_template": {
            const { navigate, assertions } = AssertTemplateArgsSchema.parse(args);
            const page = await this.ensurePage();

            if (navigate) {
              const gotoOptions = navigate.timeout !== undefined 
                ? { waitUntil: navigate.waitUntil || "load", timeout: navigate.timeout } 
                : { waitUntil: navigate.waitUntil || "load" };
              await page.goto(navigate.url, gotoOptions);
              if (navigate.waitUntil === "networkidle") {
                await page.waitForTimeout(2000);
              }
            }

            const results = await this.evaluateAssertionTemplate(page, assertions);
            return {
              content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid arguments: ${error.message}`
          );
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }



  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('✅ MCP Server connected and ready');
  }

  async listTools(): Promise<{tools: Array<{name: string; description: string; inputSchema: object}>}> {
    return {
      tools: [
        {
          name: "navigate",
          description: "Navigate to a URL",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "URL to navigate to" },
              waitUntil: { 
                type: "string", 
                enum: ["load", "domcontentloaded", "networkidle"],
                description: "Wait until condition is met"
              },
              timeout: { type: "number", description: "Timeout in milliseconds" },
            },
            required: ["url"],
          },
        },
        {
          name: "screenshot",
          description: "Take a screenshot of the current page with size management options",
          inputSchema: {
            type: "object",
            properties: {
              fullPage: { type: "boolean", description: "Capture full page" },
              quality: { type: "number", minimum: 0, maximum: 100, description: "JPEG quality" },
              type: { type: "string", enum: ["png", "jpeg"], description: "Image format" },
              maxSize: { type: "number", description: "Maximum size in bytes (default: 2MB)" },
              compress: { type: "boolean", description: "Auto-compress if too large (default: true)" },
              saveToFile: { type: "boolean", description: "Save to file instead of returning base64 (default: false)" },
            },
          },
        },
        {
          name: "scrape",
          description: "Extract text or attributes from elements",
          inputSchema: {
            type: "object",
            properties: {
              selector: { type: "string", description: "CSS selector (optional, defaults to body)" },
              attribute: { type: "string", description: "Attribute to extract (optional, defaults to textContent)" },
              multiple: { type: "boolean", description: "Extract from multiple elements" },
            },
          },
        },
        {
          name: "click",
          description: "Click on an element",
          inputSchema: {
            type: "object",
            properties: {
              selector: { type: "string", description: "CSS selector of element to click" },
              timeout: { type: "number", description: "Timeout in milliseconds" },
            },
            required: ["selector"],
          },
        },
        {
          name: "type",
          description: "Type text into an element",
          inputSchema: {
            type: "object",
            properties: {
              selector: { type: "string", description: "CSS selector of input element" },
              text: { type: "string", description: "Text to type" },
              delay: { type: "number", description: "Delay between keystrokes in milliseconds" },
            },
            required: ["selector", "text"],
          },
        },
        {
          name: "wait_for",
          description: "Wait for an element or condition",
          inputSchema: {
            type: "object",
            properties: {
              selector: { type: "string", description: "CSS selector to wait for" },
              timeout: { type: "number", description: "Timeout in milliseconds" },
              state: { 
                type: "string", 
                enum: ["attached", "detached", "visible", "hidden"],
                description: "Element state to wait for"
              },
            },
          },
        },
        {
          name: "get_url",
          description: "Get the current page URL",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "close_browser",
          description: "Close the browser instance",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "browser_health",
          description: "Check browser health and status",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "discover_elements",
          description: "Discover elements matching a selector to help resolve conflicts",
          inputSchema: {
            type: "object",
            properties: {
              selector: { type: "string", description: "CSS selector to search for" },
              limit: { type: "number", description: "Maximum number of elements to return (default: 10)" },
            },
            required: ["selector"],
          },
        },
        {
          name: "assert_template",
          description: "Run custom assertions defined in a template",
          inputSchema: {
            type: "object",
            properties: {
              navigate: {
                type: "object",
                properties: {
                  url: { type: "string", description: "URL to navigate to before assertions" },
                  waitUntil: { type: "string", enum: ["load", "domcontentloaded", "networkidle"] },
                  timeout: { type: "number" }
                }
              },
              assertions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { 
                      type: "string",
                      enum: [
                        "page_title","page_url","visible","attached","hidden","detached","text","attribute","count","css","value","checked","enabled","in_viewport"
                      ]
                    },
                    selector: { type: "string" },
                    attribute: { type: "string" },
                    name: { type: "string" },
                    expected: { },
                    contains: { type: "string" },
                    regex: { type: "string" },
                    flags: { type: "string" },
                    count: { type: "number" },
                    comparator: { type: "string", enum: ["equals","contains","matches","gt","gte","lt","lte"] },
                    timeout: { type: "number" },
                    ratio: { type: "number" },
                  },
                  required: ["type"]
                }
              }
            },
            required: ["assertions"]
          },
        },
      ],
    };
  }

  async callTool(name: string, args: unknown): Promise<{content: Array<{type: string; text?: string; data?: string; mimeType?: string}>}> {
    try {
      switch (name) {
        case "navigate": {
          const { url, waitUntil = "load", timeout = 30000 } = NavigateArgsSchema.parse(args);
          const page = await this.ensurePage();
          
          // Set default page timeout
          page.setDefaultTimeout(timeout);
          
          const gotoOptions = { 
            waitUntil: waitUntil === "networkidle" ? "domcontentloaded" : waitUntil,
            timeout
          };
          
          try {
            await page.goto(url, gotoOptions);
            
            // If we used domcontentloaded instead of networkidle, wait a bit more
            if (waitUntil === "networkidle") {
              await page.waitForTimeout(2000); // Wait 2 seconds for network to settle
            }
            
            return {
              content: [{ type: "text", text: `Navigated to ${url}` }],
            };
          } catch (error) {
            // If navigation fails, try with a more lenient approach
            console.log(`⚠️ Navigation failed with ${waitUntil}, trying with domcontentloaded...`);
            try {
              await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeout });
              return {
                content: [{ type: "text", text: `Navigated to ${url} (fallback mode)` }],
              };
            } catch (fallbackError) {
              throw new Error(`Navigation failed: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }

        case "screenshot": {
          const { 
            fullPage = false, 
            quality, 
            type = "png", 
            maxSize = 2 * 1024 * 1024, // 2MB default
            compress = true,
            saveToFile = false
          } = ScreenshotArgsSchema.parse(args);
          
          const page = await this.ensurePage();
          let screenshotOptions: PageScreenshotOptions = { fullPage, type };
          
          // Start with high quality for initial capture
          if (type === "jpeg" && quality !== undefined) {
            screenshotOptions.quality = quality;
          } else if (type === "jpeg") {
            screenshotOptions.quality = 90; // High quality initially
          }
          
          let screenshot = await page.screenshot(screenshotOptions);
          let currentSize = screenshot.length;
          
          // If screenshot is too large and compression is enabled
          if (currentSize > maxSize && compress) {
            console.log(`📸 Screenshot too large (${Math.round(currentSize / 1024)}KB), attempting compression...`);
            
            // Try different compression levels
            const compressionLevels = type === "jpeg" ? [80, 60, 40, 20] : [0.8, 0.6, 0.4, 0.2];
            
            for (const level of compressionLevels) {
              try {
                if (type === "jpeg") {
                  screenshotOptions.quality = level;
                } else {
                  // For PNG, we'll convert to JPEG with quality
                  screenshotOptions.type = "jpeg";
                  screenshotOptions.quality = level * 100;
                }
                
                screenshot = await page.screenshot(screenshotOptions);
                currentSize = screenshot.length;
                
                console.log(`📸 Compressed to ${Math.round(currentSize / 1024)}KB (quality: ${level})`);
                
                if (currentSize <= maxSize) {
                  break;
                }
              } catch (error) {
                console.log(`⚠️ Compression failed at level ${level}:`, error);
              }
            }
          }
          
          // If still too large, offer file save option
          if (currentSize > maxSize) {
            if (saveToFile) {
              // Save to file and return file path
              const screenshotsDir = join(process.cwd(), 'screenshots');
              if (!existsSync(screenshotsDir)) {
                mkdirSync(screenshotsDir, { recursive: true });
              }
              
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const filename = `screenshot-${timestamp}.${type === "jpeg" ? "jpg" : type}`;
              const filepath = join(screenshotsDir, filename);
              
              writeFileSync(filepath, screenshot);
              
              const httpUrl = `http://localhost:${process.env['PORT'] || 3000}/screenshots/${filename}`;
              return {
                content: [
                  {
                    type: "text",
                    text: `Screenshot saved to file: ${filepath}\nSize: ${Math.round(currentSize / 1024)}KB\nHTTP URL: ${httpUrl}\nNote: Screenshot was too large (${Math.round(currentSize / 1024)}KB > ${Math.round(maxSize / 1024)}KB) to send directly.`
                  }
                ],
              };
            } else {
              return {
                content: [
                  {
                    type: "text",
                    text: `❌ Screenshot too large: ${Math.round(currentSize / 1024)}KB (limit: ${Math.round(maxSize / 1024)}KB)\n\n💡 Suggestions:\n- Use saveToFile: true to save to disk\n- Reduce quality or use JPEG format\n- Take a smaller screenshot (disable fullPage)\n- Increase maxSize parameter`
                  }
                ],
              };
            }
          }
          
          // Return the screenshot data
          return {
            content: [
              {
                type: "image",
                data: screenshot.toString("base64"),
                mimeType: `image/${type === "jpeg" ? "jpeg" : type}`,
              },
            ],
          };
        }

          case "scrape": {
            const { selector = "body", attribute, multiple = false } = ScrapeArgsSchema.parse(args);
          const page = await this.ensurePage();
          
          try {
              if (selector.includes(":contains")) {
                return {
                  content: [{ type: "text", text: "❌ Invalid selector: :contains pseudo-class is not supported. Use a different strategy such as CSS selectors combined with text filters or the discover_elements tool." }],
                };
              }
              
            if (multiple) {
              const elements = await page.locator(selector).all();
              const results = [];
              for (const element of elements) {
                const value = attribute 
                  ? await element.getAttribute(attribute)
                  : await element.textContent();
                results.push(value);
              }
              return {
                content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
              };
            }
            
            // For single element, check if multiple elements match
            const locator = page.locator(selector);
            const count = await locator.count();
            
            if (count === 0) {
              return {
                content: [{ type: "text", text: "No elements found matching the selector" }],
              };
            }
            
            if (count > 1) {
              // Get information about all matching elements
              const elementInfo = [];
              for (let i = 0; i < Math.min(count, 10); i++) {
                const element = locator.nth(i);
                const tagName = await element.evaluate(el => el.tagName.toLowerCase());
                const text = await element.textContent();
                const id = await element.getAttribute('id');
                const className = await element.getAttribute('class');
                const dataTestId = await element.getAttribute('data-testid');
                
                elementInfo.push({
                  index: i,
                  tagName,
                  text: text?.substring(0, 100) || '',
                  id: id || '',
                  className: className?.substring(0, 50) || '',
                  dataTestId: dataTestId || ''
                });
              }
              
              const errorMessage = `❌ Scrape failed: Found ${count} elements matching "${selector}". Please use a more specific selector.\n\nMatching elements:\n${elementInfo.map(el => 
                `${el.index + 1}) <${el.tagName}${el.id ? ` id="${el.id}"` : ''}${el.className ? ` class="${el.className}"` : ''}${el.dataTestId ? ` data-testid="${el.dataTestId}"` : ''}>${el.text ? ` "${el.text}"` : ''}</${el.tagName}>`
              ).join('\n')}\n\n💡 Suggestions:\n- Use a more specific selector (e.g., add an ID or class)\n- Use the "discover_elements" tool to find unique selectors\n- Use multiple: true to get all matching elements\n- Try: ${selector}:first-of-type or ${selector}:nth-child(1)`;
              
              return {
                content: [{ type: "text", text: errorMessage }],
              };
            }
            
            // Single element found, proceed normally
            const element = locator.first();
            const value = attribute
              ? await element.getAttribute(attribute)
              : await element.textContent();
            return {
              content: [{ type: "text", text: value || "" }],
            };
            
          } catch (error) {
            if (error instanceof Error && error.message?.includes('strict mode violation')) {
              // This shouldn't happen with our new logic, but just in case
              const locator = page.locator(selector);
              const count = await locator.count();
              
              return {
                content: [{ 
                  type: "text", 
                  text: `❌ Strict mode violation: Found ${count} elements matching "${selector}". Use multiple: true to get all elements or make your selector more specific.` 
                }],
              };
            }
            throw error;
          }
        }

        case "click": {
          const { selector, timeout } = ClickArgsSchema.parse(args);
          const page = await this.ensurePage();
          const clickOptions = timeout !== undefined ? { timeout } : {};
          
          try {
            await page.locator(selector).click(clickOptions);
            return {
              content: [{ type: "text", text: `Clicked element: ${selector}` }],
            };
          } catch (error: unknown) {
            // Handle strict mode violations (multiple elements found)
            if (error instanceof Error && error.message?.includes('strict mode violation')) {
              const locator = page.locator(selector);
              const count = await locator.count();
              
              // Get information about all matching elements
              const elementInfo = [];
              for (let i = 0; i < Math.min(count, 10); i++) {
                const element = locator.nth(i);
                const tagName = await element.evaluate(el => el.tagName.toLowerCase());
                const text = await element.textContent();
                const id = await element.getAttribute('id');
                const className = await element.getAttribute('class');
                const dataTestId = await element.getAttribute('data-testid');
                
                elementInfo.push({
                  index: i,
                  tagName,
                  text: text?.substring(0, 100) || '',
                  id: id || '',
                  className: className?.substring(0, 50) || '',
                  dataTestId: dataTestId || ''
                });
              }
              
              const errorMessage = `❌ Click failed: Found ${count} elements matching "${selector}". Please use a more specific selector.\n\nMatching elements:\n${elementInfo.map(el => 
                `${el.index + 1}) <${el.tagName}${el.id ? ` id="${el.id}"` : ''}${el.className ? ` class="${el.className}"` : ''}${el.dataTestId ? ` data-testid="${el.dataTestId}"` : ''}>${el.text ? ` "${el.text}"` : ''}</${el.tagName}>`
              ).join('\n')}\n\n💡 Suggestions:\n- Use a more specific selector (e.g., add an ID or class)\n- Use the "discover_elements" tool to find unique selectors\n- Try clicking by index: ${selector}:nth-child(1)`;
              
              return {
                content: [{ type: "text", text: errorMessage }],
              };
            }
            
            // Re-throw other errors
            throw error;
          }
        }

        case "type": {
          const { selector, text, delay } = TypeArgsSchema.parse(args);
          const page = await this.ensurePage();
          if (delay !== undefined) {
            await page.locator(selector).type(text, { delay });
          } else {
            await page.locator(selector).fill(text);
          }
          return {
            content: [{ type: "text", text: `Typed "${text}" into ${selector}` }],
          };
        }

        case "wait_for": {
          const { selector, timeout, state = "visible" } = WaitForArgsSchema.parse(args);
          const page = await this.ensurePage();
          if (selector) {
            const waitOptions = timeout !== undefined ? { state, timeout } : { state };
            await page.locator(selector).waitFor(waitOptions);
            return {
              content: [{ type: "text", text: `Waited for ${selector} to be ${state}` }],
            };
          }
          await page.waitForTimeout(timeout || 1000);
          return {
            content: [{ type: "text", text: `Waited for ${timeout || 1000}ms` }],
          };
        }

        case "get_url": {
          const page = await this.ensurePage();
          const url = page.url();
          return {
            content: [{ type: "text", text: url }],
          };
        }

        case "close_browser": {
          if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
          }
          return {
            content: [{ type: "text", text: "Browser closed" }],
          };
        }

        case "browser_health": {
          const healthInfo: Record<string, unknown> = {
            browserAvailable: this.browserAvailable,
            browserConnected: !!this.browser,
            pageConnected: !!this.page,
            browserAge: this.browserLaunchTime > 0 ? Date.now() - this.browserLaunchTime : 0,
            retryCount: this.retryCount,
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime()
          };
          
          if (this.browser) {
            try {
              const pages = this.browser.contexts().flatMap(ctx => ctx.pages());
              healthInfo['pageCount'] = pages.length;
              healthInfo['currentUrl'] = this.page ? await this.page.url() : "No active page";
            } catch (error) {
              healthInfo['browserError'] = error instanceof Error ? error.message : String(error);
            }
          }
          
          return {
            content: [{ type: "text", text: JSON.stringify(healthInfo, null, 2) }],
          };
        }

        case "browser_status": {
          // Check browser status without starting it - safe for health checks
          const statusInfo: Record<string, unknown> = {
            browserAvailable: this.browserAvailable,
            browserConnected: !!this.browser,
            pageConnected: !!this.page,
            browserAge: this.browserLaunchTime > 0 ? Date.now() - this.browserLaunchTime : 0,
            retryCount: this.retryCount,
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime(),
            status: this.browser ? "running" : "not_started"
          };
          
          return {
            content: [{ type: "text", text: JSON.stringify(statusInfo, null, 2) }],
          };
        }

        case "discover_elements": {
          const { selector, limit = 10 } = args as { selector: string; limit?: number };
          const page = await this.ensurePage();
          const locator = page.locator(selector);
          const count = await locator.count();
          
          const elementInfo = [];
          const maxElements = Math.min(count, limit);
          
          for (let i = 0; i < maxElements; i++) {
            const element = locator.nth(i);
            try {
              const tagName = await element.evaluate(el => el.tagName.toLowerCase());
              const text = await element.textContent();
              const id = await element.getAttribute('id');
              const className = await element.getAttribute('class');
              const dataTestId = await element.getAttribute('data-testid');
              const ariaLabel = await element.getAttribute('aria-label');
              const role = await element.getAttribute('role');
              const type = await element.getAttribute('type');
              const href = await element.getAttribute('href');
              
              // Generate suggested selectors
              const suggestions = [];
              if (id) suggestions.push(`#${id}`);
              if (dataTestId) suggestions.push(`[data-testid="${dataTestId}"]`);
              if (className) {
                const classes = className.split(' ').filter(c => c.trim());
                if (classes.length > 0) {
                  suggestions.push(`.${classes[0]}`);
                  if (classes.length > 1) {
                    suggestions.push(`.${classes.slice(0, 2).join('.')}`);
                  }
                }
              }
              if (ariaLabel) suggestions.push(`[aria-label="${ariaLabel}"]`);
              if (role) suggestions.push(`[role="${role}"]`);
              if (type) suggestions.push(`[type="${type}"]`);
              if (href) suggestions.push(`[href="${href}"]`);
              
              elementInfo.push({
                index: i,
                tagName,
                text: text?.substring(0, 200) || '',
                id: id || '',
                className: className || '',
                dataTestId: dataTestId || '',
                ariaLabel: ariaLabel || '',
                role: role || '',
                type: type || '',
                href: href || '',
                suggestedSelectors: suggestions.slice(0, 3) // Top 3 suggestions
              });
            } catch (error) {
              elementInfo.push({
                index: i,
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
          
          const result = {
            selector,
            totalFound: count,
            elementsReturned: maxElements,
            elements: elementInfo
          };
          
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "get_page_title": {
          const page = await this.ensurePage();
          
          try {
            // Try to get the main page title from head > title
            const mainTitle = await page.locator('head > title').first().textContent();
            if (mainTitle) {
              return {
                content: [{ type: "text", text: mainTitle }],
              };
            }
            
            // Fallback: look for any title element
            const titleElements = await page.locator('title').all();
            if (titleElements.length > 0) {
              const titles = [];
              for (const element of titleElements) {
                const text = await element.textContent();
                if (text) titles.push(text);
              }
              
              if (titles.length === 1) {
                return {
                  content: [{ type: "text", text: titles[0] }],
                };
              } else {
                return {
                  content: [{ 
                    type: "text", 
                    text: `Found ${titles.length} title elements:\n${titles.map((t, i) => `${i + 1}) ${t}`).join('\n')}\n\nUsing first title: ${titles[0]}` 
                  }],
                };
              }
            }
            
            // No title found
            return {
              content: [{ type: "text", text: "No page title found" }],
            };
            
          } catch (error) {
            return {
              content: [{ 
                type: "text", 
                text: `Error getting page title: ${error instanceof Error ? error.message : String(error)}` 
              }],
            };
          }
        }

        case "assert_template": {
          const { navigate, assertions } = AssertTemplateArgsSchema.parse(args);
          const page = await this.ensurePage();
          if (navigate) {
            const gotoOptions = navigate.timeout !== undefined 
              ? { waitUntil: navigate.waitUntil || "load", timeout: navigate.timeout } 
              : { waitUntil: navigate.waitUntil || "load" };
            await page.goto(navigate.url, gotoOptions);
            if (navigate.waitUntil === "networkidle") {
              await page.waitForTimeout(2000);
            }
          }
          const results = await this.evaluateAssertionTemplate(page, assertions);
          return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid arguments: ${error.message}`);
      }
      throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Helper types for assertion results
type AssertionCondition = z.infer<typeof AssertionConditionSchema>;

interface AssertionResult {
  index: number;
  type: string;
  selector?: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

interface AssertionSummary {
  total: number;
  passed: number;
  failed: number;
  results: AssertionResult[];
}

// Extend class prototype with evaluator to keep file organization flat
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
PlaywrightMCPServer.prototype.evaluateAssertionTemplate = async function(
  this: PlaywrightMCPServer,
  page: Page,
  assertions: AssertionCondition[]
): Promise<AssertionSummary> {
  const results: AssertionResult[] = [];

  const waitFor = async (fn: () => Promise<boolean>, timeoutMs = 5000, intervalMs = 200): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (await fn()) return true;
      } catch {
        // ignore predicate errors during wait
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return false;
  };

  const parseRegex = (pattern?: string, flags?: string): RegExp | null => {
    if (!pattern) return null;
    try {
      // Support "/.../flags" or raw pattern
      if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
        const last = pattern.lastIndexOf("/");
        const body = pattern.slice(1, last);
        const fl = pattern.slice(last + 1);
        return new RegExp(body, fl);
      }
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  };

  for (let i = 0; i < assertions.length; i++) {
    const a = assertions[i];
    const timeoutMs = a.timeout ?? 5000;
    const result: AssertionResult = {
      index: i,
      type: a.type,
      passed: false,
      message: "",
      ...(a.selector !== undefined ? { selector: a.selector } : {}),
    };

    try {
      switch (a.type) {
        case "page_title": {
          const ok = await waitFor(async () => {
            const title = await page.title();
            if (a.regex) {
              const re = parseRegex(a.regex, a.flags || "");
              return re ? re.test(title) : false;
            }
            if (typeof a.expected === "string") {
              return a.comparator === "contains" ? title.includes(a.expected) : title === a.expected;
            }
            return false;
          }, timeoutMs);
          result.passed = ok;
          result.message = ok ? "Page title assertion passed" : "Page title assertion failed";
          break;
        }

        case "page_url": {
          const ok = await waitFor(async () => {
            const url = page.url();
            if (a.regex) {
              const re = parseRegex(a.regex, a.flags || "");
              return re ? re.test(url) : false;
            }
            if (typeof a.expected === "string") {
              return a.comparator === "contains" ? url.includes(a.expected) : url === a.expected;
            }
            return false;
          }, timeoutMs);
          result.passed = ok;
          result.message = ok ? "Page URL assertion passed" : "Page URL assertion failed";
          break;
        }

        case "visible": {
          if (!a.selector) throw new Error("selector is required for visible");
          const ok = await waitFor(async () => await page.locator(a.selector!).isVisible(), timeoutMs);
          result.passed = ok;
          result.message = ok ? `Element ${a.selector} is visible` : `Element ${a.selector} not visible`;
          break;
        }

        case "attached": {
          if (!a.selector) throw new Error("selector is required for attached");
          const ok = await waitFor(async () => (await page.locator(a.selector!).count()) > 0, timeoutMs);
          result.passed = ok;
          result.message = ok ? `Element ${a.selector} is attached` : `Element ${a.selector} not attached`;
          break;
        }

        case "hidden": {
          if (!a.selector) throw new Error("selector is required for hidden");
          const ok = await waitFor(async () => await page.locator(a.selector!).isHidden(), timeoutMs);
          result.passed = ok;
          result.message = ok ? `Element ${a.selector} is hidden` : `Element ${a.selector} not hidden`;
          break;
        }

        case "detached": {
          if (!a.selector) throw new Error("selector is required for detached");
          const ok = await waitFor(async () => (await page.locator(a.selector!).count()) === 0, timeoutMs);
          result.passed = ok;
          result.message = ok ? `Element ${a.selector} is detached` : `Element ${a.selector} still attached`;
          break;
        }

        case "text": {
          if (!a.selector) throw new Error("selector is required for text");
          const ok = await waitFor(async () => {
            const txt = await page.locator(a.selector!).first().textContent();
            const text = txt ?? "";
            if (a.regex) {
              const re = parseRegex(a.regex, a.flags || "");
              return re ? re.test(text) : false;
            }
            if (typeof a.expected === "string") {
              return a.comparator === "contains" || a.contains ? text.includes(a.expected) : text === a.expected;
            }
            return false;
          }, timeoutMs);
          result.passed = ok;
          result.message = ok ? `Text assertion passed for ${a.selector}` : `Text assertion failed for ${a.selector}`;
          break;
        }

        case "attribute": {
          if (!a.selector || !a.attribute) throw new Error("selector and attribute are required for attribute assertion");
          const ok = await waitFor(async () => {
            const value = await page.locator(a.selector!).first().getAttribute(a.attribute!);
            const val = value ?? "";
            if (a.regex) {
              const re = parseRegex(a.regex, a.flags || "");
              return re ? re.test(val) : false;
            }
            if (a.expected !== undefined && a.comparator !== "contains" && a.comparator !== "matches") {
              return String(val) === String(a.expected);
            }
            if (a.contains) return val.includes(a.contains);
            return false;
          }, timeoutMs);
          result.passed = ok;
          result.message = ok ? `Attribute assertion passed for ${a.selector}` : `Attribute assertion failed for ${a.selector}`;
          break;
        }

        case "count": {
          if (!a.selector) throw new Error("selector is required for count");
          const comparator = a.comparator || "equals";
          const expectedCount = a.count ?? (typeof a.expected === "number" ? a.expected : undefined);
          if (expectedCount === undefined) throw new Error("count or expected number is required for count assertion");
          const ok = await waitFor(async () => {
            const c = await page.locator(a.selector!).count();
            switch (comparator) {
              case "equals": return c === expectedCount;
              case "gt": return c > expectedCount;
              case "gte": return c >= expectedCount;
              case "lt": return c < expectedCount;
              case "lte": return c <= expectedCount;
              default: return c === expectedCount;
            }
          }, timeoutMs);
          result.passed = ok;
          result.details = { comparator, expected: expectedCount };
          result.message = ok ? `Count assertion passed for ${a.selector}` : `Count assertion failed for ${a.selector}`;
          break;
        }

        case "css": {
          if (!a.selector || !a.name) throw new Error("selector and name are required for css assertion");
          const ok = await waitFor(async () => {
            const value = await page.locator(a.selector!).first().evaluate((el, prop) => {
              // execute in browser context without relying on DOM typings
              const gs = (globalThis as any).getComputedStyle(el as any);
              return gs.getPropertyValue(String(prop));
            }, a.name);
            if (a.expected !== undefined) {
              return String(value).trim() === String(a.expected).trim();
            }
            if (a.contains) return String(value).includes(a.contains);
            if (a.regex) {
              const re = parseRegex(a.regex, a.flags || "");
              return re ? re.test(String(value)) : false;
            }
            return false;
          }, timeoutMs);
          result.passed = ok;
          result.message = ok ? `CSS assertion passed for ${a.selector}` : `CSS assertion failed for ${a.selector}`;
          break;
        }

        case "value": {
          if (!a.selector) throw new Error("selector is required for value assertion");
          const ok = await waitFor(async () => {
            const value = await page.locator(a.selector!).first().inputValue().catch(async () => (await page.locator(a.selector!).first().textContent()) ?? "");
            const val = value ?? "";
            if (a.expected !== undefined) return String(val) === String(a.expected);
            if (a.contains) return String(val).includes(a.contains);
            if (a.regex) {
              const re = parseRegex(a.regex, a.flags || "");
              return re ? re.test(String(val)) : false;
            }
            return false;
          }, timeoutMs);
          result.passed = ok;
          result.message = ok ? `Value assertion passed for ${a.selector}` : `Value assertion failed for ${a.selector}`;
          break;
        }

        case "checked": {
          if (!a.selector) throw new Error("selector is required for checked assertion");
          const expected = (typeof a.expected === "boolean") ? a.expected : true;
          const ok = await waitFor(async () => (await page.locator(a.selector!).first().isChecked()) === expected, timeoutMs);
          result.passed = ok;
          result.details = { expected };
          result.message = ok ? `Checked assertion passed for ${a.selector}` : `Checked assertion failed for ${a.selector}`;
          break;
        }

        case "enabled": {
          if (!a.selector) throw new Error("selector is required for enabled assertion");
          const expected = (typeof a.expected === "boolean") ? a.expected : true;
          const ok = await waitFor(async () => (await page.locator(a.selector!).first().isEnabled()) === expected, timeoutMs);
          result.passed = ok;
          result.details = { expected };
          result.message = ok ? `Enabled assertion passed for ${a.selector}` : `Enabled assertion failed for ${a.selector}`;
          break;
        }

        case "in_viewport": {
          if (!a.selector) throw new Error("selector is required for in_viewport assertion");
          const minRatio = a.ratio ?? 0.0;
          const ok = await waitFor(async () => {
            const box = await page.locator(a.selector!).first().boundingBox();
            const vw = await page.viewportSize();
            if (!box || !vw) return false;
            const interLeft = Math.max(0, Math.min(box.x + box.width, vw.width) - Math.max(box.x, 0));
            const interTop = Math.max(0, Math.min(box.y + box.height, vw.height) - Math.max(box.y, 0));
            const interArea = interLeft * interTop;
            const area = box.width * box.height;
            const ratio = area > 0 ? interArea / area : 0;
            return ratio >= minRatio;
          }, timeoutMs);
          result.passed = ok;
          result.details = { ratio: minRatio };
          result.message = ok ? `In-viewport assertion passed for ${a.selector}` : `In-viewport assertion failed for ${a.selector}`;
          break;
        }

        default:
          throw new Error(`Unsupported assertion type: ${a.type}`);
      }
    } catch (err) {
      result.passed = false;
      result.message = err instanceof Error ? err.message : String(err);
    }

    results.push(result);
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  return { total: results.length, passed, failed, results };
};

export { PlaywrightMCPServer };