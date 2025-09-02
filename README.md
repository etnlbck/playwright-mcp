# Playwright MCP Server

A custom Playwright MCP (Model Context Protocol) server that runs on Railway with streamable HTTP support.

## Features

- **MCP Protocol Support**: Fully compatible with MCP standards
- **HTTP Streaming**: Real-time streaming responses via Server-Sent Events
- **Playwright Integration**: Complete browser automation capabilities
- **Railway Deployment**: Optimized for Railway cloud platform
- **Docker Support**: Containerized deployment with all dependencies

## Available Tools

- `navigate` - Navigate to a URL with configurable wait conditions
- `screenshot` - Capture full or partial page screenshots
- `scrape` - Extract text or attributes from page elements
- `click` - Click on elements using CSS selectors
- `type` - Input text into form elements
- `wait_for` - Wait for elements or conditions
- `get_url` - Get current page URL
- `close_browser` - Clean up browser resources

## API Endpoints

### HTTP Mode

- `GET /health` - Health check endpoint
- `GET /tools` - List available tools
- `POST /execute` - Execute tools with streaming response (SSE)
- `POST /execute-sync` - Execute tools with synchronous response

### Example Usage

```bash
# List tools
curl http://localhost:3000/tools

# Execute a tool with streaming
curl -X POST http://localhost:3000/execute \\
  -H "Content-Type: application/json" \\
  -d '{"tool": "navigate", "arguments": {"url": "https://example.com"}}'

# Execute a tool synchronously
curl -X POST http://localhost:3000/execute-sync \\
  -H "Content-Type: application/json" \\
  -d '{"tool": "screenshot", "arguments": {"fullPage": true}}'
```

## Deployment

### Railway

1. Connect your repository to Railway
2. Railway will automatically detect the configuration from `railway.toml`
3. Set environment variables if needed
4. Deploy

### Docker

```bash
docker build -t playwright-mcp-server .
docker run -p 3000:3000 -e MODE=http playwright-mcp-server
```

### Local Development

```bash
npm install
npm run dev
```

## Testing

This project includes comprehensive Playwright tests with advanced assertions for browser automation and MCP server functionality.

### Test Structure

- **`tests/mcp-server.spec.ts`** - MCP server HTTP endpoints and basic functionality
- **`tests/browser-automation.spec.ts`** - Direct Playwright browser automation tests
- **`tests/mcp-integration.spec.ts`** - Integration tests combining MCP tools
- **`tests/advanced-assertions.spec.ts`** - Advanced Playwright assertions and patterns
- **`tests/helpers/test-utils.ts`** - Utility functions for common test operations

### Running Tests

```bash
# Install dependencies
npm install

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

### Key Playwright Assertions

The test suite demonstrates comprehensive Playwright assertions including:

- **Page Assertions**: `toHaveTitle()`, `toHaveURL()`, `toContainText()`
- **Element Assertions**: `toBeVisible()`, `toHaveText()`, `toHaveValue()`, `toBeChecked()`
- **Form Assertions**: `toHaveValue()`, `toBeSelected()`, `toBeValid()`
- **Screenshot Assertions**: Image validation and size verification
- **Network Assertions**: Response status, timing, and performance
- **Stream Assertions**: Server-Sent Events validation
- **Browser State Assertions**: Health checks and state verification

### Test Configuration

Tests are configured in `playwright.config.ts` with:
- Multiple browser support (Chrome, Firefox, Safari)
- Mobile viewport testing
- Automatic server startup
- Screenshot and video capture on failure
- Trace collection for debugging

## Environment Variables

- `MODE` - Server mode: "stdio" (default) or "http"
- `PORT` - HTTP server port (default: 3000)

## Architecture

The server supports two modes:
- **stdio mode**: Traditional MCP server communication
- **http mode**: REST API with streaming support for web integration