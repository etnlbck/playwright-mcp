# Testing HTTP Streamable Playwright MCP Server

This guide shows you how to test the HTTP streamable functionality of your Playwright MCP server.

## 🚀 Quick Start

### 1. Start the Server
```bash
# Build and start the server
npm run build
npm start

# Or start with monitoring
npm run start:monitor
```

### 2. Run Tests
```bash
# Option A: Comprehensive Node.js tests (recommended)
node test-streaming.js

# Option B: Simple curl tests
./test-curl.sh

# Option C: Manual testing with curl
curl http://localhost:3000/health
```

## 🧪 Test Scripts

### **test-streaming.js** - Comprehensive Testing
This Node.js script provides full testing of all server functionality:

```bash
node test-streaming.js
```

**Features:**
- ✅ Health check validation
- ✅ Keepalive endpoint testing
- ✅ Tools list retrieval
- ✅ Ready check (browser initialization)
- ✅ Browser health monitoring
- ✅ Non-streaming execution
- ✅ **Full streaming execution with real-time data processing**

### **test-curl.sh** - Simple Shell Testing
This bash script uses curl for basic endpoint testing:

```bash
./test-curl.sh [port]
```

**Features:**
- ✅ Basic endpoint testing
- ✅ JSON response validation
- ✅ Quick health checks
- ✅ Non-streaming execution
- ✅ Browser health check

## 📡 Streaming vs Non-Streaming

### **Non-Streaming Endpoint** (`/execute-sync`)
```bash
curl -X POST http://localhost:3000/execute-sync \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "navigate",
    "arguments": {
      "url": "https://example.com",
      "waitUntil": "load"
    }
  }'
```

**Response:** Complete JSON result
```json
{
  "content": [
    {
      "type": "text",
      "text": "Navigated to https://example.com"
    }
  ]
}
```

### **Streaming Endpoint** (`/execute`)
```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "screenshot",
    "arguments": {
      "fullPage": false,
      "type": "png"
    }
  }'
```

**Response:** Server-Sent Events (SSE) stream
```
data: {"type":"status","message":"Starting execution"}

data: {"type":"result","data":{"content":[{"type":"image","data":"iVBORw0KGgoAAAANSUhEUgAA...","mimeType":"image/png"}]}}

data: {"type":"complete"}
```

## 🔧 Available Tools for Testing

### **Navigation**
```json
{
  "tool": "navigate",
  "arguments": {
    "url": "https://example.com",
    "waitUntil": "load",
    "timeout": 30000
  }
}
```

### **Screenshot**
```json
{
  "tool": "screenshot",
  "arguments": {
    "fullPage": false,
    "quality": 90,
    "type": "png"
  }
}
```

### **Scraping**
```json
{
  "tool": "scrape",
  "arguments": {
    "selector": "h1",
    "attribute": "textContent",
    "multiple": false
  }
}
```

### **Browser Health**
```json
{
  "tool": "browser_health",
  "arguments": {}
}
```

### **Get Current URL**
```json
{
  "tool": "get_url",
  "arguments": {}
}
```

## 🌊 Streaming Implementation Details

### **Server-Sent Events (SSE)**
The streaming endpoint uses SSE with these headers:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
Access-Control-Allow-Origin: *
```

### **Stream Data Format**
Each event follows this pattern:
```
data: {"type": "status|result|error|complete", ...}
```

**Event Types:**
- `status` - Progress updates
- `result` - Final result data
- `error` - Error information
- `complete` - Stream finished

### **Client-Side Streaming Example**
```javascript
const response = await fetch('/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tool: 'screenshot',
    arguments: { fullPage: true }
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      console.log('Stream event:', data.type, data);
    }
  }
}
```

## 🔍 Monitoring Endpoints

### **Health Check**
```bash
curl http://localhost:3000/health
```
Returns server status, memory usage, uptime, and activity info.

### **Keepalive**
```bash
curl http://localhost:3000/keepalive
```
Simple ping to update server activity timestamp.

### **Ready Check**
```bash
curl http://localhost:3000/ready
```
Tests browser initialization and readiness.

### **Tools List**
```bash
curl http://localhost:3000/tools
```
Returns all available Playwright tools with schemas.

## 🚨 Troubleshooting

### **Server Not Responding**
1. Check if server is running: `curl http://localhost:3000/health`
2. Check server logs for errors
3. Verify port is not in use: `lsof -i :3000`

### **Browser Issues**
1. Test browser health: Use `browser_health` tool
2. Check system dependencies for Playwright
3. Monitor memory usage via health endpoint

### **Streaming Problems**
1. Ensure client supports SSE
2. Check for network timeouts
3. Verify Content-Type headers

### **Memory Issues**
1. Monitor via health endpoint
2. Check browser recycling (every 30 minutes)
3. Use keepalive to prevent idle timeouts

## 📊 Performance Testing

### **Load Testing**
```bash
# Test multiple concurrent requests
for i in {1..10}; do
  curl -X POST http://localhost:3000/execute-sync \
    -H "Content-Type: application/json" \
    -d '{"tool": "get_url", "arguments": {}}' &
done
wait
```

### **Streaming Performance**
```bash
# Test streaming with large operations
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "screenshot",
    "arguments": {
      "fullPage": true,
      "type": "png"
    }
  }' | head -20
```

## 🎯 Expected Results

### **Successful Test Run**
```
🧪 Starting HTTP Streamable Playwright MCP Server Tests

🔍 Testing Health Check...
✅ Health check passed - Uptime: 45s
📊 Memory: 156MB used / 512MB total

💓 Testing Keepalive...
✅ Keepalive successful - 2024-01-15T10:30:45.123Z

🛠️ Testing Tools List...
✅ Found 9 available tools:
  - navigate: Navigate to a URL
  - screenshot: Take a screenshot of the current page
  - scrape: Extract text or attributes from elements
  - click: Click on an element
  - type: Type text into an element
  - wait_for: Wait for an element or condition
  - get_url: Get the current page URL
  - close_browser: Close the browser instance
  - browser_health: Check browser health and status

🚀 Testing Ready Check...
✅ Ready check passed - Browser init time: 2341ms

🔧 Testing Browser Health...
✅ Browser health check successful
🌐 Browser connected: true
📄 Page connected: true
⏰ Browser age: 12s
🔄 Retry count: 0

📡 Testing Non-Streaming Execution...
✅ Non-streaming execution successful
📄 Result: {"content":[{"type":"text","text":"Navigated to https://example.com"}]}

🌊 Testing Streaming Execution...
✅ Streaming execution started
📦 Stream data: status
  Status: Starting execution
📦 Stream data: result
  Result received (1 items)
  📸 Screenshot captured (12345 chars base64)
📦 Stream data: complete
  ✅ Stream completed

📊 Test Results: 7 passed, 0 failed
🎉 All tests passed! Server is working correctly.
```

This comprehensive testing setup ensures your HTTP streamable Playwright MCP server is working correctly and can handle both streaming and non-streaming requests reliably.

