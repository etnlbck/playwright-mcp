import { test, expect } from '@playwright/test';

test.describe('Browser Automation with Playwright Assertions', () => {
  test('should navigate to page and verify title', async ({ page }) => {
    await page.goto('https://example.com');
    
    // Playwright assertions for page title
    await expect(page).toHaveTitle(/Example Domain/);
    await expect(page).toHaveTitle(/Example/);
  });

  test('should verify page content and elements', async ({ page }) => {
    await page.goto('https://example.com');
    
    // Assert page has specific text content
    await expect(page.locator('body')).toContainText('Example Domain');
    await expect(page.locator('h1')).toHaveText('Example Domain');
    
    // Assert element is visible
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('p')).toBeVisible();
    
    // Assert element count
    await expect(page.locator('p')).toHaveCount(2);
  });

  test('should interact with form elements', async ({ page }) => {
    // Navigate to a form page (using httpbin for testing)
    await page.goto('https://httpbin.org/forms/post');
    
    // Fill form fields
    await page.fill('input[name="custname"]', 'John Doe');
    await page.fill('input[name="custtel"]', '123-456-7890');
    await page.fill('input[name="custemail"]', 'john@example.com');
    await page.selectOption('select[name="size"]', 'large');
    await page.check('input[name="topping"][value="bacon"]');
    await page.check('input[name="topping"][value="cheese"]');
    await page.fill('textarea[name="comments"]', 'Extra crispy please!');
    
    // Assert form values
    await expect(page.locator('input[name="custname"]')).toHaveValue('John Doe');
    await expect(page.locator('input[name="custtel"]')).toHaveValue('123-456-7890');
    await expect(page.locator('input[name="custemail"]')).toHaveValue('john@example.com');
    await expect(page.locator('select[name="size"]')).toHaveValue('large');
    await expect(page.locator('input[name="topping"][value="bacon"]')).toBeChecked();
    await expect(page.locator('input[name="topping"][value="cheese"]')).toBeChecked();
    await expect(page.locator('textarea[name="comments"]')).toHaveValue('Extra crispy please!');
  });

  test('should handle dynamic content and wait conditions', async ({ page }) => {
    await page.goto('https://example.com');
    
    // Wait for specific elements to be visible
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('p')).toBeVisible();
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Assert page is in correct state
    await expect(page).toHaveURL(/example\.com/);
    await expect(page.locator('body')).toBeAttached();
  });

  test('should take and verify screenshots', async ({ page }) => {
    await page.goto('https://example.com');
    
    // Take full page screenshot
    const fullPageScreenshot = await page.screenshot({ fullPage: true });
    expect(fullPageScreenshot).toBeTruthy();
    expect(fullPageScreenshot.length).toBeGreaterThan(1000);
    
    // Take element screenshot
    const elementScreenshot = await page.locator('h1').screenshot();
    expect(elementScreenshot).toBeTruthy();
    expect(elementScreenshot.length).toBeGreaterThan(100);
    
    // Take viewport screenshot
    const viewportScreenshot = await page.screenshot();
    expect(viewportScreenshot).toBeTruthy();
    expect(viewportScreenshot.length).toBeGreaterThan(1000);
  });

  test('should handle navigation and back/forward', async ({ page }) => {
    // Navigate to first page
    await page.goto('https://example.com');
    await expect(page).toHaveURL(/example\.com/);
    
    // Navigate to second page
    await page.goto('https://httpbin.org/');
    await expect(page).toHaveURL(/httpbin\.org/);
    
    // Go back
    await page.goBack();
    await expect(page).toHaveURL(/example\.com/);
    
    // Go forward
    await page.goForward();
    await expect(page).toHaveURL(/httpbin\.org/);
  });

  test('should handle popups and new windows', async ({ page, context }) => {
    await page.goto('https://example.com');
    
    // Listen for popup events
    const popupPromise = context.waitForEvent('page');
    
    // Simulate opening a new window (this would be done via JavaScript)
    await page.evaluate(() => {
      window.open('https://httpbin.org/', '_blank');
    });
    
    const popup = await popupPromise;
    await popup.waitForLoadState();
    
    // Assert popup has correct URL
    await expect(popup).toHaveURL(/httpbin\.org/);
    
    // Close popup
    await popup.close();
  });

  test('should handle cookies and local storage', async ({ page, context }) => {
    await page.goto('https://example.com');
    
    // Set cookies
    await context.addCookies([
      {
        name: 'test-cookie',
        value: 'test-value',
        domain: 'example.com',
        path: '/'
      }
    ]);
    
    // Verify cookie was set
    const cookies = await context.cookies();
    const testCookie = cookies.find(cookie => cookie.name === 'test-cookie');
    expect(testCookie).toBeTruthy();
    expect(testCookie?.value).toBe('test-value');
    
    // Set local storage
    await page.evaluate(() => {
      localStorage.setItem('test-key', 'test-value');
    });
    
    // Verify local storage
    const localStorageValue = await page.evaluate(() => {
      return localStorage.getItem('test-key');
    });
    expect(localStorageValue).toBe('test-value');
  });

  test('should handle file uploads and downloads', async ({ page }) => {
    await page.goto('https://httpbin.org/forms/post');
    
    // Create a test file
    const testContent = 'This is a test file content';
    const testFile = Buffer.from(testContent);
    
    // Set file input
    await page.setInputFiles('input[name="file"]', {
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: testFile
    });
    
    // Verify file was set
    const fileInput = page.locator('input[name="file"]');
    await expect(fileInput).toHaveValue(/test\.txt/);
  });

  test('should handle keyboard and mouse interactions', async ({ page }) => {
    await page.goto('https://example.com');
    
    // Test keyboard interactions
    await page.keyboard.press('Tab');
    await page.keyboard.type('Hello World');
    
    // Test mouse interactions
    await page.mouse.move(100, 100);
    await page.mouse.click(100, 100);
    await page.mouse.dblclick(200, 200);
    
    // Test scroll
    await page.mouse.wheel(0, 100);
    
    // Assert page is still functional
    await expect(page.locator('h1')).toBeVisible();
  });

  test('should handle network conditions and offline mode', async ({ page, context }) => {
    await page.goto('https://example.com');
    
    // Verify page loads normally
    await expect(page.locator('h1')).toBeVisible();
    
    // Simulate offline mode
    await context.setOffline(true);
    
    // Try to navigate (should fail gracefully)
    try {
      await page.goto('https://httpbin.org/', { timeout: 5000 });
    } catch (error) {
      // Expected to fail in offline mode
      expect(error.message).toContain('net::ERR_INTERNET_DISCONNECTED');
    }
    
    // Go back online
    await context.setOffline(false);
    
    // Verify we can navigate again
    await page.goto('https://httpbin.org/');
    await expect(page).toHaveURL(/httpbin\.org/);
  });

  test('should handle responsive design and viewport changes', async ({ page }) => {
    await page.goto('https://example.com');
    
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('h1')).toBeVisible();
    
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('h1')).toBeVisible();
    
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('h1')).toBeVisible();
    
    // Test landscape orientation
    await page.setViewportSize({ width: 667, height: 375 });
    await expect(page.locator('h1')).toBeVisible();
  });

  test('should handle JavaScript errors and console logs', async ({ page }) => {
    const consoleLogs: string[] = [];
    const errors: string[] = [];
    
    // Listen for console logs
    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });
    
    // Listen for page errors
    page.on('pageerror', error => {
      errors.push(error.message);
    });
    
    await page.goto('https://example.com');
    
    // Execute JavaScript that logs to console
    await page.evaluate(() => {
      console.log('Test log message');
      console.warn('Test warning message');
      console.error('Test error message');
    });
    
    // Assert console logs were captured
    expect(consoleLogs).toContain('Test log message');
    expect(consoleLogs).toContain('Test warning message');
    expect(consoleLogs).toContain('Test error message');
  });

  test('should handle iframes and frames', async ({ page }) => {
    // Navigate to a page with iframe (using a test page)
    await page.goto('https://example.com');
    
    // Create an iframe for testing
    await page.evaluate(() => {
      const iframe = document.createElement('iframe');
      iframe.src = 'https://httpbin.org/';
      iframe.id = 'test-iframe';
      document.body.appendChild(iframe);
    });
    
    // Wait for iframe to load
    const iframe = page.frameLocator('#test-iframe');
    await expect(iframe.locator('body')).toBeVisible();
    
    // Interact with iframe content
    await iframe.locator('body').click();
  });

  test('should handle drag and drop operations', async ({ page }) => {
    await page.goto('https://example.com');
    
    // Create draggable elements for testing
    await page.evaluate(() => {
      const container = document.createElement('div');
      container.style.cssText = 'width: 200px; height: 200px; border: 1px solid black; position: relative;';
      
      const draggable = document.createElement('div');
      draggable.style.cssText = 'width: 50px; height: 50px; background: red; position: absolute; top: 0; left: 0; cursor: move;';
      draggable.draggable = true;
      draggable.id = 'draggable';
      
      const dropzone = document.createElement('div');
      dropzone.style.cssText = 'width: 100px; height: 100px; background: blue; position: absolute; top: 50px; left: 50px;';
      dropzone.id = 'dropzone';
      
      container.appendChild(draggable);
      container.appendChild(dropzone);
      document.body.appendChild(container);
    });
    
    // Perform drag and drop
    const draggable = page.locator('#draggable');
    const dropzone = page.locator('#dropzone');
    
    await draggable.dragTo(dropzone);
    
    // Verify elements are still present
    await expect(draggable).toBeVisible();
    await expect(dropzone).toBeVisible();
  });
});
