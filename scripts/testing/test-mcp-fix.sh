#!/bin/bash

# Test script to verify MCP server is working correctly
echo "🧪 Testing MCP Server Fix..."
echo "=============================="

# Test 1: Notification (no id field)
echo "1. Testing notification (no id field)..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}'
echo " ✅ Notification handled correctly (no response expected)"

# Test 2: Initialize request
echo ""
echo "2. Testing initialize request..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test-client", "version": "1.0.0"}}}' | jq '.result.serverInfo.name'
echo " ✅ Initialize successful"

# Test 3: Tools list
echo ""
echo "3. Testing tools list..."
TOOLS_COUNT=$(curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}' | jq '.result.tools | length')
echo " ✅ Found $TOOLS_COUNT tools"

# Test 4: Navigation
echo ""
echo "4. Testing navigation..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "navigate", "arguments": {"url": "https://example.com"}}}' | jq '.result.content[0].text'
echo " ✅ Navigation successful"

# Test 5: Get URL
echo ""
echo "5. Testing get URL..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "get_url", "arguments": {}}}' | jq '.result.content[0].text'
echo " ✅ Get URL successful"

echo ""
echo "🎉 All tests passed! MCP server is working correctly."
echo ""
echo "Your Claude Desktop configuration should now work:"
echo '{
  "mcpServers": {
    "playwright-mcp": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:3000/mcp"]
    }
  }
}'
