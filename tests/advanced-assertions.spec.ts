import { test, expect } from '@playwright/test';
import { 
  executeMCPTool, 
  executeMCPToolStreaming, 
  getBrowserHealth,
  navigateToUrl,
  takeScreenshot,
  scrapeContent,
  assertStreamEvent,
  assertStreamComplete,
  assertValidImage,
  assertBrowserHealth
} from './helpers/test-utils';

test.describe('Advanced Playwright Assertions', () => {
  test('should demonstrate comprehensive page state assertions', async ({ page }) => {
    await page.goto('https://example.com');
    
    // Title assertions
    await expect(page).toHaveTitle(/Example Domain/);
    await expect(page).toHaveTitle(/Example/, { timeout: 5000 });
    
    // URL assertions
    await expect(page).toHaveURL(/example\.com/);
    await expect(page).toHaveURL(/example\.com\/$/, { timeout: 5000 });
    
    // Element visibility and state assertions
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h1')).toBeAttached();
    await expect(page.locator('h1')).toBeInViewport();
    
    // Text content assertions
    await expect(page.locator('h1')).toHaveText('Example Domain');
    await expect(page.locator('h1')).toContainText('Example');
    await expect(page.locator('body')).toContainText('Example Domain');
    
    // Element count assertions
    await expect(page.locator('p')).toHaveCount(2);
    await expect(page.locator('a')).toHaveCount(1);
    
    // Element attribute assertions
    await expect(page.locator('a')).toHaveAttribute('href', 'https://www.iana.org/domains/example');
    
    // CSS property assertions
    await expect(page.locator('h1')).toHaveCSS('display', 'block');
    await expect(page.locator('h1')).toHaveCSS('font-family');
    
    // Element state assertions
    await expect(page.locator('h1')).toBeEnabled();
    await expect(page.locator('h1')).toBeEditable();
  });

  test('should demonstrate form interaction assertions', async ({ page }) => {
    await page.goto('https://httpbin.org/forms/post');
    
    // Fill form fields
    await page.fill('input[name="custname"]', 'John Doe');
    await page.fill('input[name="custtel"]', '123-456-7890');
    await page.fill('input[name="custemail"]', 'john@example.com');
    await page.selectOption('select[name="size"]', 'large');
    await page.check('input[name="topping"][value="bacon"]');
    await page.check('input[name="topping"][value="cheese"]');
    await page.fill('textarea[name="comments"]', 'Extra crispy please!');
    
    // Input value assertions
    await expect(page.locator('input[name="custname"]')).toHaveValue('John Doe');
    await expect(page.locator('input[name="custtel"]')).toHaveValue('123-456-7890');
    await expect(page.locator('input[name="custemail"]')).toHaveValue('john@example.com');
    await expect(page.locator('textarea[name="comments"]')).toHaveValue('Extra crispy please!');
    
    // Select option assertions
    await expect(page.locator('select[name="size"]')).toHaveValue('large');
    await expect(page.locator('select[name="size"] option[value="large"]')).toBeSelected();
    
    // Checkbox assertions
    await expect(page.locator('input[name="topping"][value="bacon"]')).toBeChecked();
    await expect(page.locator('input[name="topping"][value="cheese"]')).toBeChecked();
    await expect(page.locator('input[name="topping"][value="onion"]')).not.toBeChecked();
    
    // Form validation assertions
    await expect(page.locator('input[name="custname"]')).toBeValid();
    await expect(page.locator('input[name="custemail"]')).toBeValid();
    
    // Required field assertions
    await expect(page.locator('input[name="custname"]')).toHaveAttribute('required');
  });

  test('should demonstrate advanced element state assertions', async ({ page }) => {
    await page.goto('https://example.com');
    
    // Element positioning assertions
    const h1Box = await page.locator('h1').boundingBox();
    expect(h1Box).toBeTruthy();
    expect(h1Box!.x).toBeGreaterThan(0);
    expect(h1Box!.y).toBeGreaterThan(0);
    expect(h1Box!.width).toBeGreaterThan(0);
    expect(h1Box!.height).toBeGreaterThan(0);
    
    // Element visibility in viewport
    await expect(page.locator('h1')).toBeInViewport();
    await expect(page.locator('h1')).toBeInViewport({ ratio: 0.5 });
    
    // Element focus assertions
    await page.locator('h1').focus();
    await expect(page.locator('h1')).toBeFocused();
    
    // Element hover state
    await page.locator('h1').hover();
    await expect(page.locator('h1')).toBeHovered();
  });

  test('should demonstrate network and performance assertions', async ({ page, context }) => {
    // Monitor network requests
    const requests: string[] = [];
    const responses: string[] = [];
    
    page.on('request', request => requests.push(request.url()));
    page.on('response', response => responses.push(response.url()));
    
    await page.goto('https://example.com');
    
    // Network request assertions
    expect(requests).toContain('https://example.com/');
    expect(responses).toContain('https://example.com/');
    
    // Response status assertions
    const response = await page.waitForResponse('https://example.com/');
    expect(response.status()).toBe(200);
    expect(response.ok()).toBe(true);
    
    // Performance timing assertions
    const performanceTiming = await page.evaluate(() => {
      const timing = performance.timing;
      return {
        loadTime: timing.loadEventEnd - timing.navigationStart,
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
        firstPaint: performance.getEntriesByType('paint')[0]?.startTime || 0
      };
    });
    
    expect(performanceTiming.loadTime).toBeGreaterThan(0);
    expect(performanceTiming.domContentLoaded).toBeGreaterThan(0);
    expect(performanceTiming.domContentLoaded).toBeLessThan(performanceTiming.loadTime);
  });

  test('should demonstrate screenshot and visual assertions', async ({ page }) => {
    await page.goto('https://example.com');
    
    // Full page screenshot
    const fullPageScreenshot = await page.screenshot({ fullPage: true });
    expect(fullPageScreenshot).toBeTruthy();
    expect(fullPageScreenshot.length).toBeGreaterThan(1000);
    
    // Element screenshot
    const elementScreenshot = await page.locator('h1').screenshot();
    expect(elementScreenshot).toBeTruthy();
    expect(elementScreenshot.length).toBeGreaterThan(100);
    
    // Viewport screenshot
    const viewportScreenshot = await page.screenshot();
    expect(viewportScreenshot).toBeTruthy();
    expect(viewportScreenshot.length).toBeGreaterThan(1000);
    
    // Screenshot with specific options
    const pngScreenshot = await page.screenshot({ 
      type: 'png',
      quality: 90,
      fullPage: false 
    });
    expect(pngScreenshot).toBeTruthy();
    
    // Compare screenshot sizes
    expect(fullPageScreenshot.length).toBeGreaterThan(viewportScreenshot.length);
  });

  test('should demonstrate MCP tool execution with advanced assertions', async ({ request }) => {
    // Navigate using MCP tool
    await navigateToUrl(request, 'https://example.com', 'load');
    
    // Verify navigation success
    const urlResult = await executeMCPTool(request, 'get_url', {});
    expect(urlResult.content[0].text).toBe('https://example.com/');
    
    // Scrape content with multiple selectors
    const h1Content = await scrapeContent(request, 'h1', 'textContent');
    expect(h1Content).toBe('Example Domain');
    
    const bodyContent = await scrapeContent(request, 'body', 'textContent');
    expect(bodyContent).toContain('Example Domain');
    expect(bodyContent).toContain('This domain is for use in illustrative examples');
    
    // Take screenshot and validate
    const screenshot = await takeScreenshot(request, { 
      fullPage: true, 
      type: 'png' 
    });
    assertValidImage(screenshot.data, screenshot.mimeType, 2000);
    
    // Check browser health
    const health = await getBrowserHealth(request);
    assertBrowserHealth(health);
    expect(health.browserAge).toBeGreaterThan(0);
    expect(health.retryCount).toBeGreaterThanOrEqual(0);
  });

  test('should demonstrate streaming execution with advanced assertions', async ({ request }) => {
    // Execute streaming navigation
    const streamEvents = await executeMCPToolStreaming(request, 'navigate', {
      url: 'https://example.com',
      waitUntil: 'load'
    });
    
    // Assert stream event structure
    expect(streamEvents.length).toBeGreaterThan(0);
    assertStreamComplete(streamEvents);
    
    // Assert specific event types
    assertStreamEvent(streamEvents, 'status');
    assertStreamEvent(streamEvents, 'result');
    assertStreamEvent(streamEvents, 'complete');
    
    // Assert event data content
    const statusEvent = streamEvents.find(e => e.type === 'status');
    expect(statusEvent?.message).toContain('Starting execution');
    
    const resultEvent = streamEvents.find(e => e.type === 'result');
    expect(resultEvent?.data).toBeTruthy();
    expect(resultEvent?.data.content).toBeTruthy();
    expect(Array.isArray(resultEvent?.data.content)).toBe(true);
    
    // Execute streaming screenshot
    const screenshotStream = await executeMCPToolStreaming(request, 'screenshot', {
      fullPage: false,
      type: 'png'
    });
    
    expect(screenshotStream.length).toBeGreaterThan(0);
    assertStreamComplete(screenshotStream);
    
    // Assert image data in result
    const screenshotResult = screenshotStream.find(e => e.type === 'result');
    expect(screenshotResult?.data.content[0].type).toBe('image');
    expect(screenshotResult?.data.content[0].mimeType).toBe('image/png');
    expect(screenshotResult?.data.content[0].data.length).toBeGreaterThan(1000);
  });

  test('should demonstrate error handling and validation assertions', async ({ request }) => {
    // Test invalid URL handling
    const invalidResult = await executeMCPTool(request, 'navigate', {
      url: 'https://invalid-domain-that-does-not-exist.com'
    });
    
    expect(invalidResult.content[0].text).toContain('error');
    expect(invalidResult.content[0].text).toContain('net::ERR_NAME_NOT_RESOLVED');
    
    // Test missing required arguments
    const missingArgsResult = await executeMCPTool(request, 'click', {});
    expect(missingArgsResult.content[0].text).toContain('error');
    expect(missingArgsResult.content[0].text).toContain('selector');
    
    // Test invalid tool name
    const invalidToolResult = await executeMCPTool(request, 'invalid_tool', {});
    expect(invalidToolResult.content[0].text).toContain('error');
    expect(invalidToolResult.content[0].text).toContain('Unknown tool');
    
    // Verify browser is still healthy after errors
    const health = await getBrowserHealth(request);
    assertBrowserHealth(health);
    expect(health.browserConnected).toBe(true);
  });

  test('should demonstrate concurrent operation assertions', async ({ request }) => {
    // Start multiple operations concurrently
    const operations = [
      executeMCPTool(request, 'navigate', { url: 'https://example.com' }),
      executeMCPTool(request, 'browser_health', {}),
      executeMCPTool(request, 'get_url', {})
    ];
    
    // Wait for all operations to complete
    const results = await Promise.all(operations);
    
    // Assert all operations succeeded
    results.forEach(result => {
      expect(result.content).toBeTruthy();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
    });
    
    // Assert specific results
    expect(results[0].content[0].text).toContain('Navigated to https://example.com');
    expect(results[1].content[0].text).toContain('browserConnected');
    expect(results[2].content[0].text).toContain('example.com');
    
    // Verify browser health after concurrent operations
    const health = await getBrowserHealth(request);
    assertBrowserHealth(health);
  });

  test('should demonstrate performance and timing assertions', async ({ request }) => {
    const startTime = Date.now();
    
    // Execute multiple operations and measure timing
    await executeMCPTool(request, 'navigate', { url: 'https://example.com' });
    const navigateTime = Date.now() - startTime;
    
    const scrapeStartTime = Date.now();
    await executeMCPTool(request, 'scrape', { selector: 'h1' });
    const scrapeTime = Date.now() - scrapeStartTime;
    
    const screenshotStartTime = Date.now();
    await executeMCPTool(request, 'screenshot', { fullPage: true });
    const screenshotTime = Date.now() - screenshotStartTime;
    
    // Assert reasonable timing (adjust thresholds as needed)
    expect(navigateTime).toBeLessThan(10000); // 10 seconds
    expect(scrapeTime).toBeLessThan(5000);    // 5 seconds
    expect(screenshotTime).toBeLessThan(15000); // 15 seconds
    
    // Assert total execution time
    const totalTime = Date.now() - startTime;
    expect(totalTime).toBeLessThan(30000); // 30 seconds total
    
    // Verify operations completed successfully
    const health = await getBrowserHealth(request);
    assertBrowserHealth(health);
  });
});
