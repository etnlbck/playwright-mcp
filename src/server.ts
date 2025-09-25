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

class PlaywrightMCPServer {
  private server: Server;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private browserAvailable = true;
  private browserLaunchTime = 0;
  private maxBrowserAge = 30 * 60 * 1000; // 30 minutes
  private retryCount = 0;
  private maxRetries = 3;

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

export { PlaywrightMCPServer };