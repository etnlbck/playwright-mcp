import { expect } from '@playwright/test';

/**
 * Utility functions for MCP server testing
 */

export interface MCPToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
}

export interface BrowserHealth {
  browserConnected: boolean;
  pageConnected: boolean;
  browserAge: number;
  retryCount: number;
}

/**
 * Execute an MCP tool and return the parsed result
 */
export async function executeMCPTool(
  request: any,
  tool: string,
  arguments_: Record<string, any> = {}
): Promise<MCPToolResult> {
  const response = await request.post('/execute-sync', {
    data: {
      tool,
      arguments: arguments_
    }
  });

  expect(response.status()).toBe(200);
  return await response.json();
}

/**
 * Execute an MCP tool via streaming and return stream events
 */
export async function executeMCPToolStreaming(
  request: any,
  tool: string,
  arguments_: Record<string, any> = {}
): Promise<Array<{ type: string; data?: any; message?: string }>> {
  const response = await request.post('/execute', {
    data: {
      tool,
      arguments: arguments_
    }
  });

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/event-stream');

  const chunks: string[] = [];
  for await (const chunk of response.body()) {
    chunks.push(chunk.toString());
  }

  const streamData = chunks.join('');
  const lines = streamData.split('\n');
  const dataLines = lines.filter(line => line.startsWith('data: '));

  return dataLines.map(line => {
    try {
      return JSON.parse(line.slice(6));
    } catch {
      return { type: 'parse-error', message: line };
    }
  });
}

/**
 * Get browser health status
 */
export async function getBrowserHealth(request: any): Promise<BrowserHealth> {
  const result = await executeMCPTool(request, 'browser_health', {});
  return JSON.parse(result.content[0].text);
}

/**
 * Navigate to a URL and verify success
 */
export async function navigateToUrl(
  request: any,
  url: string,
  waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'load'
): Promise<void> {
  const result = await executeMCPTool(request, 'navigate', {
    url,
    waitUntil
  });

  expect(result.content[0].text).toContain(`Navigated to ${url}`);
}

/**
 * Get current page URL
 */
export async function getCurrentUrl(request: any): Promise<string> {
  const result = await executeMCPTool(request, 'get_url', {});
  return result.content[0].text;
}

/**
 * Take a screenshot and verify it's valid
 */
export async function takeScreenshot(
  request: any,
  options: {
    fullPage?: boolean;
    type?: 'png' | 'jpeg';
    quality?: number;
  } = {}
): Promise<{ data: string; mimeType: string }> {
  const result = await executeMCPTool(request, 'screenshot', options);
  
  expect(result.content[0].type).toBe('image');
  expect(result.content[0].data).toBeTruthy();
  expect(result.content[0].data.length).toBeGreaterThan(1000);
  
  return {
    data: result.content[0].data,
    mimeType: result.content[0].mimeType || 'image/png'
  };
}

/**
 * Scrape content from page elements
 */
export async function scrapeContent(
  request: any,
  selector: string,
  attribute: string = 'textContent',
  multiple: boolean = false
): Promise<string> {
  const result = await executeMCPTool(request, 'scrape', {
    selector,
    attribute,
    multiple
  });

  return result.content[0].text;
}

/**
 * Click on an element
 */
export async function clickElement(
  request: any,
  selector: string,
  timeout?: number
): Promise<void> {
  const result = await executeMCPTool(request, 'click', {
    selector,
    timeout
  });

  expect(result.content[0].text).toContain('Clicked on element');
}

/**
 * Type text into an element
 */
export async function typeText(
  request: any,
  selector: string,
  text: string,
  delay?: number
): Promise<void> {
  const result = await executeMCPTool(request, 'type', {
    selector,
    text,
    delay
  });

  expect(result.content[0].text).toContain('Typed text into element');
}

/**
 * Wait for an element or condition
 */
export async function waitForElement(
  request: any,
  selector: string,
  state: 'attached' | 'detached' | 'visible' | 'hidden' = 'visible',
  timeout?: number
): Promise<void> {
  const result = await executeMCPTool(request, 'wait_for', {
    selector,
    state,
    timeout
  });

  expect(result.content[0].text).toContain('Element found');
}

/**
 * Verify server health
 */
export async function verifyServerHealth(request: any): Promise<void> {
  const response = await request.get('/health');
  expect(response.status()).toBe(200);
  
  const health = await response.json();
  expect(health.status).toBe('healthy');
  expect(health.uptime).toBeGreaterThan(0);
  expect(health.memory.used).toBeGreaterThan(0);
}

/**
 * Verify tools list
 */
export async function verifyToolsList(request: any): Promise<string[]> {
  const response = await request.get('/tools');
  expect(response.status()).toBe(200);
  
  const tools = await response.json();
  expect(Array.isArray(tools.tools)).toBe(true);
  expect(tools.tools.length).toBeGreaterThan(0);
  
  return tools.tools.map((tool: any) => tool.name);
}

/**
 * Wait for a specific amount of time
 */
export async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Assert that a stream event contains specific data
 */
export function assertStreamEvent(
  events: Array<{ type: string; data?: any; message?: string }>,
  eventType: string,
  expectedData?: any
): void {
  const event = events.find(e => e.type === eventType);
  expect(event).toBeTruthy();
  
  if (expectedData) {
    expect(event?.data).toEqual(expectedData);
  }
}

/**
 * Assert that all required stream events are present
 */
export function assertStreamComplete(
  events: Array<{ type: string; data?: any; message?: string }>
): void {
  const eventTypes = events.map(e => e.type);
  expect(eventTypes).toContain('status');
  expect(eventTypes).toContain('result');
  expect(eventTypes).toContain('complete');
}

/**
 * Create a test page with specific content for testing
 */
export async function createTestPage(
  page: any,
  content: string
): Promise<void> {
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Test Page</title>
    </head>
    <body>
      ${content}
    </body>
    </html>
  `);
}

/**
 * Generate a random string for testing
 */
export function generateRandomString(length: number = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Assert that an image is valid (has reasonable size and format)
 */
export function assertValidImage(
  imageData: string,
  mimeType: string,
  minSize: number = 1000
): void {
  expect(imageData).toBeTruthy();
  expect(imageData.length).toBeGreaterThan(minSize);
  expect(mimeType).toMatch(/^image\/(png|jpeg|jpg|gif|webp)$/);
}

/**
 * Assert that a URL is valid
 */
export function assertValidUrl(url: string): void {
  expect(url).toMatch(/^https?:\/\/.+/);
}

/**
 * Assert that browser health is good
 */
export function assertBrowserHealth(health: BrowserHealth): void {
  expect(health.browserConnected).toBe(true);
  expect(health.pageConnected).toBe(true);
  expect(health.browserAge).toBeGreaterThan(0);
  expect(health.retryCount).toBeGreaterThanOrEqual(0);
}
