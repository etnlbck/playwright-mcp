# Claude Desktop MCP Integration Setup

This guide shows you how to connect your Playwright MCP server to Claude Desktop using proper HTTP MCP protocol support.

## 🎯 **Two Integration Options**

### **Option 1: HTTP MCP Adapter (Recommended)**
Uses a proper MCP server that translates MCP protocol calls to HTTP requests.

### **Option 2: Direct HTTP Configuration**
Uses Claude Desktop's built-in HTTP MCP support (if available).

## 🚀 **Option 1: HTTP MCP Adapter Setup**

### **Step 1: Install Playwright Browsers**
```bash
npx playwright install
```

### **Step 2: Start the HTTP Server**
```bash
# Terminal 1: Start the HTTP server
PORT=3000 MODE=http npm start
```

### **Step 3: Configure Claude Desktop**
Add this to your Claude Desktop configuration file:

**Location:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

```json
{
  "mcpServers": {
    "playwright-mcp": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:3000/mcp"]
    }
  }
}
```

### **Step 4: Test the Integration**
```bash
# Test the HTTP server
curl http://localhost:3000/health

# Test the MCP adapter
npm run start:http-adapter
```

## 🌐 **Option 2: Direct HTTP Configuration**

If Claude Desktop supports direct HTTP MCP connections:

```json
{
  "mcpServers": {
    "playwright-http": {
      "type": "http",
      "baseUrl": "http://localhost:3000",
      "endpoints": {
        "tools": "/tools",
        "execute": "/execute-sync",
        "health": "/health"
      },
      "headers": {
        "Content-Type": "application/json"
      }
    }
  }
}
```

## 🛠️ **Available Playwright Tools**

Once connected, you'll have access to these tools in Claude Desktop:

### **Navigation**
- `navigate` - Navigate to a URL
- `get_url` - Get current page URL

### **Content Interaction**
- `click` - Click on elements
- `type` - Type text into inputs
- `wait_for` - Wait for elements to appear

### **Content Extraction**
- `scrape` - Extract text or attributes
- `screenshot` - Take screenshots

### **Browser Management**
- `browser_health` - Check browser status
- `close_browser` - Close browser instance

## 📋 **Example Usage in Claude Desktop**

Once configured, you can use commands like:

```
"Navigate to https://example.com and take a screenshot"
"Scrape the title from the current page"
"Click the submit button and wait for the form to process"
"Get the current URL and browser health status"
```

## 🔧 **Troubleshooting**

### **Server Not Starting**
```bash
# Check if port is in use
lsof -i :3000

# Kill existing processes
pkill -f "node.*dist/index.js"

# Start with explicit environment
PORT=3000 MODE=http npm start
```

### **Browser Issues**
```bash
# Install Playwright browsers
npx playwright install

# Check browser health
curl -X POST http://localhost:3000/execute-sync \
  -H "Content-Type: application/json" \
  -d '{"tool": "browser_health", "arguments": {}}'
```

### **MCP Adapter Issues**
```bash
# Test HTTP server connection
curl http://localhost:3000/health

# Test tools endpoint
curl http://localhost:3000/tools

# Run adapter in debug mode
npm run dev:http-adapter
```

### **Claude Desktop Not Connecting**
1. **Check configuration file location**
2. **Restart Claude Desktop** after configuration changes
3. **Check logs** in Claude Desktop for MCP connection errors
4. **Verify paths** in the configuration are correct

## 📊 **Monitoring & Health Checks**

### **HTTP Server Endpoints**
- `GET /health` - Server health and memory usage
- `GET /keepalive` - Keep server alive
- `GET /tools` - List available tools
- `GET /ready` - Browser readiness check

### **Health Check Example**
```bash
curl http://localhost:3000/health | jq .
```

Response:
```json
{
  "status": "ok",
  "uptime": 123.45,
  "memory": {
    "used": 156,
    "total": 512
  },
  "server": "running"
}
```

## 🚀 **Quick Start Script**

Use the provided setup script:

```bash
./setup-claude-desktop.sh
```

This script will:
1. Build the project
2. Install Playwright browsers
3. Find your Claude Desktop config
4. Update the configuration
5. Create startup and test scripts

## 🔄 **Workflow**

1. **Start HTTP Server**: `PORT=3000 MODE=http npm start`
2. **Start MCP Adapter**: `npm run start:http-adapter` (in another terminal)
3. **Open Claude Desktop** - Tools should be available
4. **Use Playwright tools** in your conversations

## 📝 **Configuration Files**

- `claude-desktop-mcp-config.json` - MCP adapter configuration
- `claude-desktop-http-config.json` - Direct HTTP configuration
- `claude-desktop-config.json` - Basic configuration

## 🎉 **Success Indicators**

You'll know it's working when:
- ✅ HTTP server responds to health checks
- ✅ MCP adapter connects successfully
- ✅ Claude Desktop shows Playwright tools
- ✅ You can execute browser automation commands

The HTTP MCP adapter approach ensures proper protocol compliance while leveraging your existing HTTP server infrastructure!




