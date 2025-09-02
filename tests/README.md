# Playwright Test Suite for MCP Server

This directory contains comprehensive Playwright tests for the MCP (Model Context Protocol) server with browser automation capabilities.

## Test Structure

### Test Files

- **`mcp-server.spec.ts`** - Tests for MCP server HTTP endpoints and basic functionality
- **`browser-automation.spec.ts`** - Direct Playwright browser automation tests with assertions
- **`mcp-integration.spec.ts`** - Integration tests combining MCP tools in workflows
- **`helpers/test-utils.ts`** - Utility functions for common test operations

### Test Categories

#### 1. MCP Server HTTP Endpoints (`mcp-server.spec.ts`)
- Health check endpoint validation
- Keepalive endpoint testing
- Tools list retrieval and validation
- Ready check for browser initialization
- Non-streaming tool execution
- Streaming tool execution with Server-Sent Events
- Error handling and validation

#### 2. Browser Automation (`browser-automation.spec.ts`)
- Page navigation and title verification
- Content and element assertions
- Form interaction testing
- Dynamic content handling
- Screenshot capture and validation
- Navigation history (back/forward)
- Popup and new window handling
- Cookies and local storage management
- File uploads and downloads
- Keyboard and mouse interactions
- Network conditions and offline mode
- Responsive design testing
- JavaScript error handling
- Iframe and frame interactions
- Drag and drop operations

#### 3. Integration Tests (`mcp-integration.spec.ts`)
- Complete workflow testing (navigate → scrape → screenshot)
- Form interaction workflows
- Streaming workflow validation
- Browser state maintenance
- Error recovery and retry logic
- Concurrent operations handling
- Performance testing with large content
- Wait conditions and timeout handling

## Key Playwright Assertions Used

### Page Assertions
```typescript
await expect(page).toHaveTitle(/Example Domain/);
await expect(page).toHaveURL(/example\.com/);
await expect(page.locator('h1')).toBeVisible();
await expect(page.locator('h1')).toHaveText('Example Domain');
await expect(page.locator('body')).toContainText('Example Domain');
```

### Element Assertions
```typescript
await expect(page.locator('input[name="custname"]')).toHaveValue('John Doe');
await expect(page.locator('input[type="checkbox"]')).toBeChecked();
await expect(page.locator('select[name="size"]')).toHaveValue('large');
await expect(page.locator('p')).toHaveCount(2);
```

### Form Interaction Assertions
```typescript
await expect(page.locator('input[name="custname"]')).toHaveValue('John Doe');
await expect(page.locator('input[name="topping"][value="bacon"]')).toBeChecked();
await expect(page.locator('textarea[name="comments"]')).toHaveValue('Extra crispy please!');
```

### Screenshot Assertions
```typescript
const screenshot = await page.screenshot({ fullPage: true });
expect(screenshot).toBeTruthy();
expect(screenshot.length).toBeGreaterThan(1000);
```

### Network and Performance Assertions
```typescript
await expect(response.status()).toBe(200);
await expect(response.headers()['content-type']).toContain('text/event-stream');
expect(health.browserConnected).toBe(true);
expect(health.browserAge).toBeGreaterThan(0);
```

## Running Tests

### Prerequisites
1. Install dependencies: `npm install`
2. Start the MCP server: `npm run dev` (in another terminal)

### Test Commands
```bash
# Run all tests
npm test

# Run tests in headed mode (see browser)
npm run test:headed

# Run tests with UI mode
npm run test:ui

# Debug tests
npm run test:debug

# Show test report
npm run test:report
```

### Test Configuration
The tests are configured in `playwright.config.ts` with:
- Multiple browser support (Chrome, Firefox, Safari)
- Mobile viewport testing
- Automatic server startup
- Screenshot and video capture on failure
- Trace collection for debugging

## Test Utilities

The `helpers/test-utils.ts` file provides utility functions for:
- MCP tool execution (sync and streaming)
- Browser health checking
- Navigation and URL management
- Screenshot capture and validation
- Content scraping
- Element interaction (click, type, wait)
- Server health verification
- Stream event validation
- Test data generation

## Assertion Patterns

### HTTP Response Assertions
```typescript
expect(response.status()).toBe(200);
expect(response.headers()['content-type']).toContain('application/json');
```

### JSON Data Assertions
```typescript
expect(data).toHaveProperty('status', 'healthy');
expect(data.memory.used).toBeGreaterThan(0);
expect(Array.isArray(data.tools)).toBe(true);
```

### Stream Event Assertions
```typescript
expect(streamData).toContain('data: ');
expect(eventTypes).toContain('status');
expect(eventTypes).toContain('result');
expect(eventTypes).toContain('complete');
```

### Browser State Assertions
```typescript
expect(health.browserConnected).toBe(true);
expect(health.pageConnected).toBe(true);
expect(health.browserAge).toBeGreaterThan(0);
```

## Best Practices

1. **Use explicit assertions** - Always use `expect()` for validation
2. **Test both success and failure cases** - Include error handling tests
3. **Use utility functions** - Leverage `test-utils.ts` for common operations
4. **Test streaming and non-streaming** - Cover both execution modes
5. **Verify browser health** - Check browser state after operations
6. **Test concurrent operations** - Ensure thread safety
7. **Use proper timeouts** - Set appropriate wait times for operations
8. **Clean up resources** - Ensure proper cleanup in test teardown

## Debugging Tests

### View Test Results
```bash
npm run test:report
```

### Debug Individual Tests
```bash
npm run test:debug -- --grep "should navigate to page"
```

### Run Specific Test File
```bash
npx playwright test tests/mcp-server.spec.ts
```

### Run Tests in Specific Browser
```bash
npx playwright test --project=chromium
```

## Continuous Integration

The test suite is designed to work in CI environments with:
- Automatic server startup
- Proper resource cleanup
- Retry logic for flaky tests
- Comprehensive reporting
- Multiple browser testing
- Performance monitoring
