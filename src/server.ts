import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { Browser, chromium, Page } from "playwright";
import { z } from "zod";

const NavigateArgsSchema = z.object({
  url: z.string().url(),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
  timeout: z.number().optional(),
});

const ScreenshotArgsSchema = z.object({
  fullPage: z.boolean().optional(),
  quality: z.number().min(0).max(100).optional(),
  type: z.enum(["png", "jpeg"]).optional(),
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
  }

  private async ensureBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }
  }

  private async ensurePage(): Promise<Page> {
    await this.ensureBrowser();
    if (!this.page && this.browser) {
      this.page = await this.browser.newPage();
    }
    return this.page!;
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
            description: "Take a screenshot of the current page",
            inputSchema: {
              type: "object",
              properties: {
                fullPage: { type: "boolean", description: "Capture full page" },
                quality: { type: "number", minimum: 0, maximum: 100, description: "JPEG quality" },
                type: { type: "string", enum: ["png", "jpeg"], description: "Image format" },
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
            await page.goto(url, { waitUntil, timeout });
            return {
              content: [{ type: "text", text: `Navigated to ${url}` }],
            };
          }

          case "screenshot": {
            const { fullPage = false, quality, type = "png" } = ScreenshotArgsSchema.parse(args);
            const page = await this.ensurePage();
            const screenshot = await page.screenshot({
              fullPage,
              quality: type === "jpeg" ? quality : undefined,
              type,
            });
            return {
              content: [
                {
                  type: "image",
                  data: screenshot.toString("base64"),
                  mimeType: `image/${type}`,
                },
              ],
            };
          }

          case "scrape": {
            const { selector = "body", attribute, multiple = false } = ScrapeArgsSchema.parse(args);
            const page = await this.ensurePage();
            
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
            } else {
              const element = page.locator(selector);
              const value = attribute
                ? await element.getAttribute(attribute)
                : await element.textContent();
              return {
                content: [{ type: "text", text: value || "" }],
              };
            }
          }

          case "click": {
            const { selector, timeout } = ClickArgsSchema.parse(args);
            const page = await this.ensurePage();
            await page.locator(selector).click({ timeout });
            return {
              content: [{ type: "text", text: `Clicked element: ${selector}` }],
            };
          }

          case "type": {
            const { selector, text, delay } = TypeArgsSchema.parse(args);
            const page = await this.ensurePage();
            await page.locator(selector).fill(text);
            if (delay) {
              await page.locator(selector).type(text, { delay });
            }
            return {
              content: [{ type: "text", text: `Typed "${text}" into ${selector}` }],
            };
          }

          case "wait_for": {
            const { selector, timeout, state = "visible" } = WaitForArgsSchema.parse(args);
            const page = await this.ensurePage();
            if (selector) {
              await page.locator(selector).waitFor({ state, timeout });
              return {
                content: [{ type: "text", text: `Waited for ${selector} to be ${state}` }],
              };
            } else {
              await page.waitForTimeout(timeout || 1000);
              return {
                content: [{ type: "text", text: `Waited for ${timeout || 1000}ms` }],
              };
            }
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

    process.on("SIGINT", async () => {
      if (this.browser) {
        await this.browser.close();
      }
      process.exit(0);
    });
  }
}

export { PlaywrightMCPServer };