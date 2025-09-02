#!/bin/bash

# Test Docker build for Railway deployment
echo "🐳 Testing Docker build for Railway..."
echo "======================================"

# Build the Docker image
echo "1. Building Docker image..."
docker build -t playwright-mcp-test .

if [ $? -eq 0 ]; then
    echo "✅ Docker build successful"
else
    echo "❌ Docker build failed"
    exit 1
fi

# Test the container
echo ""
echo "2. Testing container startup..."
docker run -d --name playwright-mcp-test -p 3001:3000 playwright-mcp-test

# Wait for container to start
sleep 10

# Test health endpoint
echo ""
echo "3. Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:3001/health | jq '.status' 2>/dev/null)

if [ "$HEALTH_RESPONSE" = '"healthy"' ]; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed"
    echo "Response: $HEALTH_RESPONSE"
fi

# Test MCP endpoint
echo ""
echo "4. Testing MCP endpoint..."
MCP_RESPONSE=$(curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test-client", "version": "1.0.0"}}}' | jq '.result.serverInfo.name' 2>/dev/null)

if [ "$MCP_RESPONSE" = '"playwright-mcp-server"' ]; then
    echo "✅ MCP endpoint working"
else
    echo "❌ MCP endpoint failed"
    echo "Response: $MCP_RESPONSE"
fi

# Test browser functionality
echo ""
echo "5. Testing browser functionality..."
BROWSER_RESPONSE=$(curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "browser_health", "arguments": {}}}' | jq '.result.content[0].text' 2>/dev/null)

if echo "$BROWSER_RESPONSE" | grep -q "browserConnected"; then
    echo "✅ Browser functionality working"
else
    echo "❌ Browser functionality failed"
    echo "Response: $BROWSER_RESPONSE"
fi

# Cleanup
echo ""
echo "6. Cleaning up..."
docker stop playwright-mcp-test
docker rm playwright-mcp-test

echo ""
echo "🎉 Docker build test completed!"
echo ""
echo "If all tests passed, your Railway deployment should work correctly."
echo "If browser tests failed, you may need to adjust the Dockerfile further."
