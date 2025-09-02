#!/bin/bash

echo "🧪 Testing n8n/LangChain Connectivity Endpoints"
echo "=============================================="

# Start the server in the background
echo "🚀 Starting MCP server..."
PORT=3000 MODE=http npm start &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 3

echo ""
echo "🔍 Testing root endpoint (GET /)..."
curl -s http://localhost:3000/ | jq '.'

echo ""
echo "🏥 Testing health endpoint (GET /health)..."
curl -s http://localhost:3000/health | jq '.'

echo ""
echo "📊 Testing status endpoint (GET /status)..."
curl -s http://localhost:3000/status | jq '.'

echo ""
echo "🔧 Testing tools endpoint (GET /tools)..."
curl -s http://localhost:3000/tools | jq '.'

echo ""
echo "✅ Testing ready endpoint (GET /ready)..."
curl -s http://localhost:3000/ready | jq '.'

echo ""
echo "💓 Testing keepalive endpoint (GET /keepalive)..."
curl -s http://localhost:3000/keepalive | jq '.'

echo ""
echo "📡 Testing MCP info endpoint (GET /mcp)..."
curl -s http://localhost:3000/mcp | jq '.'

echo ""
echo "🧪 Testing MCP protocol (POST /mcp)..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }' | jq '.result.tools | length'

# Clean up
echo ""
echo "🧹 Cleaning up..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo ""
echo "✅ n8n/LangChain connectivity test completed!"
echo ""
echo "🎉 The server now provides these GET endpoints:"
echo "   - GET / - Server information and available endpoints"
echo "   - GET /health - Health check with memory usage"
echo "   - GET /status - Simple status check (LangChain compatible)"
echo "   - GET /tools - List of available tools"
echo "   - GET /ready - Browser readiness check"
echo "   - GET /keepalive - Keep-alive endpoint"
echo "   - GET /mcp - MCP protocol information"
echo ""
echo "💡 This should resolve n8n connectivity issues!"
