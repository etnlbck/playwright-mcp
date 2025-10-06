#!/bin/bash

echo "🧪 Testing Improved Error Handling for Playwright MCP Server"
echo "=============================================================="

# Start the server in the background
echo "🚀 Starting MCP server..."
PORT=3000 MODE=http npm start &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 3

# Test the discover_elements tool
echo ""
echo "🔍 Testing discover_elements tool..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "discover_elements",
      "arguments": {
        "selector": "text=COLOR",
        "limit": 5
      }
    }
  }' | jq -r '.result.content[0].text'

echo ""
echo "🎯 Testing improved click error handling..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "click",
      "arguments": {
        "selector": "text=COLOR"
      }
    }
  }' | jq -r '.result.content[0].text'

echo ""
echo "🌐 Testing with a real website..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "navigate",
      "arguments": {
        "url": "https://example.com"
      }
    }
  }' | jq -r '.result.content[0].text'

echo ""
echo "🔍 Testing discover_elements on example.com..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "discover_elements",
      "arguments": {
        "selector": "h1",
        "limit": 3
      }
    }
  }' | jq -r '.result.content[0].text'

# Clean up
echo ""
echo "🧹 Cleaning up..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo ""
echo "✅ Error handling test completed!"
echo ""
echo "💡 Key improvements:"
echo "   - Click tool now provides detailed error messages when multiple elements are found"
echo "   - New discover_elements tool helps identify unique selectors"
echo "   - Better error messages with actionable suggestions"
echo "   - No more hard crashes - errors are communicated back to the LLM"
