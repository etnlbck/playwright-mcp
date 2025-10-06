#!/bin/bash

# Test script for HTTP streamable Playwright MCP server using curl
# Usage: ./test-curl.sh [port]

PORT=${1:-3000}
BASE_URL="http://localhost:$PORT"

echo "🧪 Testing HTTP Streamable Playwright MCP Server on port $PORT"
echo "================================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo -e "\n${CYAN}🔍 Testing Health Check...${NC}"
if curl -s "$BASE_URL/health" | jq . > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Health check passed${NC}"
    curl -s "$BASE_URL/health" | jq '.uptime, .memory.used, .memory.total'
else
    echo -e "${RED}❌ Health check failed${NC}"
fi

# Test 2: Keepalive
echo -e "\n${CYAN}💓 Testing Keepalive...${NC}"
if curl -s "$BASE_URL/keepalive" | jq . > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Keepalive successful${NC}"
    curl -s "$BASE_URL/keepalive" | jq '.timestamp, .uptime'
else
    echo -e "${RED}❌ Keepalive failed${NC}"
fi

# Test 3: Tools List
echo -e "\n${CYAN}🛠️ Testing Tools List...${NC}"
if curl -s "$BASE_URL/tools" | jq . > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Tools list retrieved${NC}"
    curl -s "$BASE_URL/tools" | jq '.tools | length'
    echo "Available tools:"
    curl -s "$BASE_URL/tools" | jq -r '.tools[].name'
else
    echo -e "${RED}❌ Tools list failed${NC}"
fi

# Test 4: Ready Check
echo -e "\n${CYAN}🚀 Testing Ready Check...${NC}"
if curl -s "$BASE_URL/ready" | jq . > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Ready check passed${NC}"
    curl -s "$BASE_URL/ready" | jq '.status, .browserInitTime'
else
    echo -e "${RED}❌ Ready check failed${NC}"
fi

# Test 5: Non-Streaming Execution
echo -e "\n${CYAN}📡 Testing Non-Streaming Execution...${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/execute-sync" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "navigate",
    "arguments": {
      "url": "https://example.com",
      "waitUntil": "load"
    }
  }')

if echo "$RESPONSE" | jq . > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Non-streaming execution successful${NC}"
    echo "$RESPONSE" | jq '.content[0].text'
else
    echo -e "${RED}❌ Non-streaming execution failed${NC}"
    echo "$RESPONSE"
fi

# Test 6: Browser Health
echo -e "\n${CYAN}🔧 Testing Browser Health...${NC}"
HEALTH_RESPONSE=$(curl -s -X POST "$BASE_URL/execute-sync" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "browser_health",
    "arguments": {}
  }')

if echo "$HEALTH_RESPONSE" | jq . > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Browser health check successful${NC}"
    echo "$HEALTH_RESPONSE" | jq -r '.content[0].text' | jq '.browserConnected, .pageConnected, .browserAge, .retryCount'
else
    echo -e "${RED}❌ Browser health check failed${NC}"
    echo "$HEALTH_RESPONSE"
fi

# Test 7: Streaming Execution (simplified)
echo -e "\n${CYAN}🌊 Testing Streaming Execution...${NC}"
echo -e "${YELLOW}Note: This is a simplified test. For full streaming, use the Node.js test script.${NC}"

# Start streaming request in background and capture first few lines
timeout 10s curl -s -X POST "$BASE_URL/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "get_url",
    "arguments": {}
  }' | head -5

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Streaming endpoint accessible${NC}"
else
    echo -e "${RED}❌ Streaming endpoint failed${NC}"
fi

echo -e "\n${BLUE}================================================================"
echo -e "🎉 Testing complete! Check the results above.${NC}"
echo -e "${YELLOW}💡 For full streaming tests, run: node test-streaming.js${NC}"

