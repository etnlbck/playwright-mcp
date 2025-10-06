#!/bin/bash

echo "🧪 Testing Error Handling with Lexus Website"
echo "============================================="

# Start the server in the background
echo "🚀 Starting MCP server..."
PORT=3000 MODE=http npm start &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 3

# Navigate to Lexus website
echo ""
echo "🌐 Navigating to Lexus website..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "navigate",
      "arguments": {
        "url": "https://www.lexus.com/build/LC/2026/9260?exteriorColors=0223&interiorColors=LA40&wheels=standardwheel&zipcode=90210",
        "timeout": 60000
      }
    }
  }' | jq -r '.result.content[0].text'

echo ""
echo "🔍 Discovering elements with 'COLOR' text..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
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
echo "🎯 Testing improved click error handling with multiple elements..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "click",
      "arguments": {
        "selector": "text=COLOR"
      }
    }
  }' | jq -r '.result.content[0].text'

echo ""
echo "💡 Testing with a more specific selector..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "discover_elements",
      "arguments": {
        "selector": "button[aria-label=\"COLOR\"]",
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
echo "✅ Lexus error handling test completed!"
echo ""
echo "🎉 The server now provides:"
echo "   - Detailed error messages when multiple elements are found"
echo "   - Element discovery tool to help find unique selectors"
echo "   - Actionable suggestions for resolving conflicts"
echo "   - No more hard crashes - errors are communicated back to the LLM"
