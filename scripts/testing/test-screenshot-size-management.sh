#!/bin/bash

echo "🧪 Testing Screenshot Size Management"
echo "===================================="

# Start the server in the background
echo "🚀 Starting MCP server..."
PORT=3000 MODE=http npm start &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 3

# Navigate to a page that will create a large screenshot
echo ""
echo "🌐 Navigating to a page with lots of content..."
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
echo "📸 Testing normal screenshot (should work)..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "screenshot",
      "arguments": {
        "fullPage": false,
        "type": "png"
      }
    }
  }' | jq -r '.result.content[0].text' | head -c 100

echo ""
echo "📸 Testing screenshot with very small size limit (should compress or save to file)..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "screenshot",
      "arguments": {
        "fullPage": true,
        "type": "png",
        "maxSize": 50000,
        "compress": true
      }
    }
  }' | jq -r '.result.content[0].text'

echo ""
echo "📸 Testing screenshot with saveToFile option..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "screenshot",
      "arguments": {
        "fullPage": true,
        "type": "jpeg",
        "maxSize": 100000,
        "saveToFile": true
      }
    }
  }' | jq -r '.result.content[0].text'

echo ""
echo "📸 Testing screenshot with no compression (should fail if too large)..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "screenshot",
      "arguments": {
        "fullPage": true,
        "type": "png",
        "maxSize": 10000,
        "compress": false
      }
    }
  }' | jq -r '.result.content[0].text'

# Test the screenshot file serving endpoint
echo ""
echo "🔍 Testing screenshot file serving endpoint..."
if [ -d "screenshots" ] && [ "$(ls -A screenshots)" ]; then
  FILENAME=$(ls screenshots/ | head -n 1)
  echo "📁 Found screenshot file: $FILENAME"
  echo "🌐 Testing HTTP endpoint: http://localhost:3000/screenshots/$FILENAME"
  curl -s -I "http://localhost:3000/screenshots/$FILENAME" | head -n 3
else
  echo "📁 No screenshot files found to test serving endpoint"
fi

# Clean up
echo ""
echo "🧹 Cleaning up..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo ""
echo "✅ Screenshot size management test completed!"
echo ""
echo "🎉 The server now provides:"
echo "   - Automatic compression when screenshots are too large"
echo "   - Configurable size limits (default: 2MB)"
echo "   - File saving option for large screenshots"
echo "   - HTTP endpoint to serve saved screenshots"
echo "   - Helpful error messages with suggestions"
echo ""
echo "💡 This should resolve Claude Desktop screenshot size issues!"

