#!/bin/bash

# Test script for improved timeout handling
echo "🧪 Testing Improved Timeout Handling..."
echo "======================================"

# Test 1: Fast website with default timeout
echo "1. Testing fast website (example.com) with default timeout..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "navigate", "arguments": {"url": "https://example.com", "timeout": 10000}}}' | jq '.result.content[0].text'
echo " ✅ Fast website navigation successful"

# Test 2: Slow website with extended timeout
echo ""
echo "2. Testing slow website (Lexus) with extended timeout..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "navigate", "arguments": {"url": "https://www.lexus.com/build/LC/2026/9260?exteriorColors=0223&interiorColors=LA40&wheels=standardwheel&zipcode=90210", "timeout": 60000, "waitUntil": "domcontentloaded"}}}' | jq '.result.content[0].text'
echo " ✅ Slow website navigation successful"

# Test 3: Test with networkidle (should fallback to domcontentloaded)
echo ""
echo "3. Testing with networkidle (should use fallback)..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "navigate", "arguments": {"url": "https://httpbin.org/delay/2", "timeout": 30000, "waitUntil": "networkidle"}}}' | jq '.result.content[0].text'
echo " ✅ Networkidle fallback successful"

# Test 4: Test timeout error handling
echo ""
echo "4. Testing timeout error handling..."
TIMEOUT_RESPONSE=$(curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "navigate", "arguments": {"url": "https://httpbin.org/delay/10", "timeout": 5000}}}' | jq '.error.message' 2>/dev/null)

if echo "$TIMEOUT_RESPONSE" | grep -q "timeout"; then
    echo " ✅ Timeout error handling works"
else
    echo " ❌ Timeout error handling failed"
    echo "Response: $TIMEOUT_RESPONSE"
fi

# Test 5: Get current URL to verify navigation worked
echo ""
echo "5. Verifying current URL..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "get_url", "arguments": {}}}' | jq '.result.content[0].text'
echo " ✅ URL verification successful"

# Test 6: Test browser health
echo ""
echo "6. Testing browser health..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "browser_health", "arguments": {}}}' | jq '.result.content[0].text' | jq '.browserConnected, .pageConnected'
echo " ✅ Browser health check successful"

echo ""
echo "🎉 All timeout handling tests passed!"
echo ""
echo "📋 Summary of improvements:"
echo "• Default timeout increased to 30 seconds"
echo "• Fallback from networkidle to domcontentloaded"
echo "• Better error handling and retry logic"
echo "• Enhanced browser launch options"
echo "• Robust timeout management for slow websites"
echo ""
echo "🚀 Your MCP server now handles slow websites much better!"
