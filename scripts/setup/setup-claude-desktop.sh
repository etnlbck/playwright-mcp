#!/bin/bash

# Setup script for Claude Desktop MCP integration
# This script helps you configure Claude Desktop to use the Playwright MCP server

echo "🚀 Setting up Claude Desktop MCP integration for Playwright"
echo "=============================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the current directory
CURRENT_DIR=$(pwd)
echo -e "${CYAN}📁 Current directory: $CURRENT_DIR${NC}"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found. Please run this script from the playwrightMCP directory.${NC}"
    exit 1
fi

# Build the project
echo -e "\n${CYAN}🔨 Building the project...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed. Please fix the errors and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful${NC}"

# Install Playwright browsers
echo -e "\n${CYAN}🌐 Installing Playwright browsers...${NC}"
npx playwright install

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️ Playwright browser installation failed. You may need to install them manually.${NC}"
    echo -e "${YELLOW}   Run: npx playwright install${NC}"
fi

# Find Claude Desktop config directory
echo -e "\n${CYAN}🔍 Looking for Claude Desktop configuration...${NC}"

# Common locations for Claude Desktop config
CONFIG_LOCATIONS=(
    "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
    "$HOME/.config/claude/claude_desktop_config.json"
    "$HOME/AppData/Roaming/Claude/claude_desktop_config.json"
    "$HOME/.claude/claude_desktop_config.json"
)

CLAUDE_CONFIG=""
for location in "${CONFIG_LOCATIONS[@]}"; do
    if [ -f "$location" ]; then
        CLAUDE_CONFIG="$location"
        break
    fi
done

if [ -z "$CLAUDE_CONFIG" ]; then
    echo -e "${YELLOW}⚠️ Claude Desktop config not found in common locations.${NC}"
    echo -e "${YELLOW}   Please create the config file manually.${NC}"
    echo -e "\n${BLUE}📝 Create a file at one of these locations:${NC}"
    for location in "${CONFIG_LOCATIONS[@]}"; do
        echo -e "   ${BLUE}$location${NC}"
    done
    echo -e "\n${BLUE}📋 Use this configuration:${NC}"
    cat claude-desktop-mcp-config.json
else
    echo -e "${GREEN}✅ Found Claude Desktop config at: $CLAUDE_CONFIG${NC}"
    
    # Backup existing config
    if [ -f "$CLAUDE_CONFIG" ]; then
        cp "$CLAUDE_CONFIG" "${CLAUDE_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
        echo -e "${GREEN}✅ Backed up existing config${NC}"
    fi
    
    # Update config
    echo -e "\n${CYAN}📝 Updating Claude Desktop configuration...${NC}"
    
    # Read existing config or create new one
    if [ -f "$CLAUDE_CONFIG" ]; then
        # Merge with existing config
        jq --argjson newConfig "$(cat claude-desktop-mcp-config.json)" '.mcpServers += $newConfig.mcpServers' "$CLAUDE_CONFIG" > "${CLAUDE_CONFIG}.tmp" && mv "${CLAUDE_CONFIG}.tmp" "$CLAUDE_CONFIG"
    else
        # Create new config
        mkdir -p "$(dirname "$CLAUDE_CONFIG")"
        cp claude-desktop-mcp-config.json "$CLAUDE_CONFIG"
    fi
    
    echo -e "${GREEN}✅ Configuration updated${NC}"
fi

# Create startup script
echo -e "\n${CYAN}📝 Creating startup script...${NC}"
cat > start-playwright-mcp.sh << 'EOF'
#!/bin/bash

# Start Playwright MCP HTTP Server
echo "🚀 Starting Playwright MCP HTTP Server..."

# Kill any existing server
pkill -f "node.*dist/index.js" 2>/dev/null

# Start the server
cd "$(dirname "$0")"
PORT=3000 MODE=http npm start &

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 5

# Test server health
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ Playwright MCP HTTP Server is running on port 3000"
    echo "🔗 You can now use Claude Desktop with Playwright MCP tools"
    echo "📊 Health check: http://localhost:3000/health"
    echo "🛠️ Tools list: http://localhost:3000/tools"
else
    echo "❌ Server failed to start. Check the logs above."
    exit 1
fi

# Keep script running
echo "Press Ctrl+C to stop the server"
wait
EOF

chmod +x start-playwright-mcp.sh
echo -e "${GREEN}✅ Startup script created: start-playwright-mcp.sh${NC}"

# Create test script
echo -e "\n${CYAN}📝 Creating test script...${NC}"
cat > test-claude-desktop.sh << 'EOF'
#!/bin/bash

echo "🧪 Testing Claude Desktop MCP integration"
echo "=========================================="

# Test HTTP server
echo "🔍 Testing HTTP server..."
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ HTTP server is running"
else
    echo "❌ HTTP server is not running. Start it with: ./start-playwright-mcp.sh"
    exit 1
fi

# Test tools endpoint
echo "🛠️ Testing tools endpoint..."
TOOLS_RESPONSE=$(curl -s http://localhost:3000/tools)
if echo "$TOOLS_RESPONSE" | jq . > /dev/null 2>&1; then
    echo "✅ Tools endpoint working"
    TOOL_COUNT=$(echo "$TOOLS_RESPONSE" | jq '.tools | length')
    echo "📊 Found $TOOL_COUNT available tools"
else
    echo "❌ Tools endpoint failed"
fi

# Test MCP client
echo "🤖 Testing MCP client..."
if [ -f "dist/mcp-client.js" ]; then
    echo "✅ MCP client built successfully"
else
    echo "❌ MCP client not built. Run: npm run build"
fi

echo "🎉 Test complete!"
EOF

chmod +x test-claude-desktop.sh
echo -e "${GREEN}✅ Test script created: test-claude-desktop.sh${NC}"

# Final instructions
echo -e "\n${GREEN}🎉 Setup complete!${NC}"
echo -e "\n${BLUE}📋 Next steps:${NC}"
echo -e "1. ${YELLOW}Start the HTTP server:${NC} ./start-playwright-mcp.sh"
echo -e "2. ${YELLOW}Test the integration:${NC} ./test-claude-desktop.sh"
echo -e "3. ${YELLOW}Restart Claude Desktop${NC} to load the new MCP configuration"
echo -e "4. ${YELLOW}In Claude Desktop, you should see Playwright tools available${NC}"

echo -e "\n${BLUE}🔧 Available Playwright tools:${NC}"
echo -e "   • navigate - Navigate to a URL"
echo -e "   • screenshot - Take a screenshot"
echo -e "   • scrape - Extract text or attributes"
echo -e "   • click - Click on elements"
echo -e "   • type - Type text into inputs"
echo -e "   • wait_for - Wait for elements"
echo -e "   • get_url - Get current URL"
echo -e "   • browser_health - Check browser status"

echo -e "\n${BLUE}📊 Monitoring endpoints:${NC}"
echo -e "   • Health: http://localhost:3000/health"
echo -e "   • Keepalive: http://localhost:3000/keepalive"
echo -e "   • Tools: http://localhost:3000/tools"

echo -e "\n${YELLOW}💡 Tip: Keep the HTTP server running while using Claude Desktop${NC}"

