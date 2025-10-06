#!/bin/bash

# Setup script for Claude Desktop MCP integration
# This script configures Claude Desktop to use the Playwright MCP server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Setting up Claude Desktop MCP Integration${NC}"
echo "=================================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Please run this script from the project root directory${NC}"
    exit 1
fi

# Build the project
echo -e "${YELLOW}📦 Building the project...${NC}"
npm run build

# Install Playwright browsers
echo -e "${YELLOW}🌐 Installing Playwright browsers...${NC}"
npx playwright install

# Find Claude Desktop config location
CLAUDE_CONFIG=""
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    CLAUDE_CONFIG="$HOME/.config/claude/claude_desktop_config.json"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    # Windows
    CLAUDE_CONFIG="$APPDATA/Claude/claude_desktop_config.json"
else
    echo -e "${RED}❌ Unsupported operating system: $OSTYPE${NC}"
    exit 1
fi

echo -e "${BLUE}📁 Claude Desktop config location: $CLAUDE_CONFIG${NC}"

# Create config directory if it doesn't exist
mkdir -p "$(dirname "$CLAUDE_CONFIG")"

# Backup existing config if it exists
if [ -f "$CLAUDE_CONFIG" ]; then
    echo -e "${YELLOW}💾 Backing up existing config...${NC}"
    cp "$CLAUDE_CONFIG" "$CLAUDE_CONFIG.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Create the MCP configuration
echo -e "${YELLOW}⚙️ Creating MCP configuration...${NC}"
cat > "$CLAUDE_CONFIG" << EOF
{
  "mcpServers": {
    "playwright-mcp": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:3000/mcp"]
    }
  }
}
EOF

echo -e "${GREEN}✅ Claude Desktop configuration created successfully!${NC}"

# Create startup script
echo -e "${YELLOW}📝 Creating startup script...${NC}"
cat > start-mcp-server.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting Playwright MCP Server..."
echo "Make sure to keep this terminal open while using Claude Desktop"
echo "Press Ctrl+C to stop the server"
echo ""
PORT=3000 MODE=http npm start
EOF

chmod +x start-mcp-server.sh

# Create test script
echo -e "${YELLOW}🧪 Creating test script...${NC}"
cat > test-mcp-server.sh << 'EOF'
#!/bin/bash
echo "🧪 Testing MCP Server..."
echo ""

# Test health endpoint
echo "1. Testing health endpoint..."
curl -s http://localhost:3000/health | jq . || echo "❌ Health check failed"

echo ""
echo "2. Testing MCP initialize..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test-client", "version": "1.0.0"}}}' | jq . || echo "❌ Initialize failed"

echo ""
echo "3. Testing tools list..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}' | jq '.result.tools | length' || echo "❌ Tools list failed"

echo ""
echo "4. Testing navigation..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "navigate", "arguments": {"url": "https://example.com"}}}' | jq '.result.content[0].text' || echo "❌ Navigation failed"

echo ""
echo "✅ MCP Server test completed!"
EOF

chmod +x test-mcp-server.sh

echo -e "${GREEN}🎉 Setup completed successfully!${NC}"
echo ""
echo -e "${BLUE}📋 Next steps:${NC}"
echo "1. Start the MCP server: ${YELLOW}./start-mcp-server.sh${NC}"
echo "2. Open Claude Desktop"
echo "3. You should see Playwright tools available in Claude Desktop"
echo "4. Test the server: ${YELLOW}./test-mcp-server.sh${NC}"
echo ""
echo -e "${BLUE}🛠️ Available Playwright tools in Claude Desktop:${NC}"
echo "• navigate - Navigate to a URL"
echo "• screenshot - Take page screenshots"
echo "• scrape - Extract page content"
echo "• click - Click on elements"
echo "• type - Type text into inputs"
echo "• wait_for - Wait for elements"
echo "• get_url - Get current page URL"
echo "• browser_health - Check browser status"
echo "• close_browser - Close browser instance"
echo ""
echo -e "${YELLOW}💡 Example usage in Claude Desktop:${NC}"
echo "\"Navigate to https://example.com and take a screenshot\""
echo "\"Scrape the title from the current page\""
echo "\"Click the submit button and wait for the form to process\""
echo ""
echo -e "${GREEN}Happy browsing with Claude Desktop! 🎉${NC}"
