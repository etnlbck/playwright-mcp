#!/bin/bash

echo "🧪 Comprehensive Error Handling Test"
echo "===================================="

# Start the server in the background
echo "🚀 Starting MCP server..."
PORT=3000 MODE=http npm start &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 3

# Navigate to a simple page first
echo ""
echo "🌐 Navigating to example.com..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "navigate",
      "arguments": {
        "url": "https://example.com"
      }
    }
  }' | jq -r '.result.content[0].text'

echo ""
echo "🔍 Testing discover_elements with 'Example' text..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "discover_elements",
      "arguments": {
        "selector": "text=Example",
        "limit": 5
      }
    }
  }' | jq -r '.result.content[0].text'

echo ""
echo "🎯 Testing click with ambiguous selector (should show error)..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "click",
      "arguments": {
        "selector": "text=Example"
      }
    }
  }' | jq -r '.result.content[0].text'

echo ""
echo "🌐 Now testing with a page that has multiple similar elements..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "navigate",
      "arguments": {
        "url": "https://httpbin.org/forms/post"
      }
    }
  }' | jq -r '.result.content[0].text'

echo ""
echo "🔍 Discovering input elements..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "discover_elements",
      "arguments": {
        "selector": "input",
        "limit": 5
      }
    }
  }' | jq -r '.result.content[0].text'

echo ""
echo "🎯 Testing click with multiple input elements (should show error)..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "tools/call",
    "params": {
      "name": "click",
      "arguments": {
        "selector": "input"
      }
    }
  }' | jq -r '.result.content[0].text'

# Clean up
echo ""
echo "🧹 Cleaning up..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo ""
echo "✅ Comprehensive error handling test completed!"
