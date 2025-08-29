#!/bin/bash

# Deploy Playwright MCP Adapter to Railway
# This script helps you deploy the MCP adapter to Railway for remote access

echo "🚀 Deploying Playwright MCP Adapter to Railway"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${YELLOW}⚠️ Railway CLI not found. Installing...${NC}"
    npm install -g @railway/cli
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to install Railway CLI${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Railway CLI installed${NC}"
fi

# Check if user is logged in
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️ Not logged in to Railway. Please login...${NC}"
    railway login
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to login to Railway${NC}"
        exit 1
    fi
fi

# Build the project
echo -e "\n${CYAN}🔨 Building the project...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed. Please fix the errors and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful${NC}"

# Create Railway project if it doesn't exist
echo -e "\n${CYAN}🚂 Setting up Railway project...${NC}"

# Check if we're in a Railway project
if [ ! -f "railway.json" ] && [ ! -d ".railway" ]; then
    echo -e "${YELLOW}⚠️ Not in a Railway project. Creating new project...${NC}"
    railway init
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to create Railway project${NC}"
        exit 1
    fi
fi

# Set environment variables
echo -e "\n${CYAN}🔧 Setting environment variables...${NC}"
railway variables set MODE=http
railway variables set NODE_ENV=production
railway variables set PORT=3000
railway variables set PLAYWRIGHT_HTTP_URL=http://localhost:3000

echo -e "${GREEN}✅ Environment variables set${NC}"

# Deploy to Railway
echo -e "\n${CYAN}🚀 Deploying to Railway...${NC}"
railway up

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

# Get the deployment URL
echo -e "\n${CYAN}🔍 Getting deployment URL...${NC}"
RAILWAY_URL=$(railway domain)

if [ -z "$RAILWAY_URL" ]; then
    echo -e "${YELLOW}⚠️ Could not get Railway URL. Check Railway dashboard.${NC}"
else
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo -e "\n${BLUE}🌐 Your MCP Adapter is available at:${NC}"
    echo -e "   ${GREEN}https://$RAILWAY_URL${NC}"
    
    echo -e "\n${BLUE}📋 Available endpoints:${NC}"
    echo -e "   • Health: ${GREEN}https://$RAILWAY_URL/health${NC}"
    echo -e "   • Tools: ${GREEN}https://$RAILWAY_URL/tools${NC}"
    echo -e "   • Execute: ${GREEN}https://$RAILWAY_URL/execute-sync${NC}"
    echo -e "   • Keepalive: ${GREEN}https://$RAILWAY_URL/keepalive${NC}"
    
    echo -e "\n${BLUE}🧪 Test your deployment:${NC}"
    echo -e "   curl https://$RAILWAY_URL/health"
    
    echo -e "\n${BLUE}🔧 For n8n integration:${NC}"
    echo -e "   Use: ${GREEN}https://$RAILWAY_URL/execute-sync${NC}"
    echo -e "   Method: POST"
    echo -e "   Content-Type: application/json"
    
    echo -e "\n${BLUE}🤖 For Claude Desktop:${NC}"
    echo -e "   Update your MCP config with:"
    echo -e "   ${GREEN}https://$RAILWAY_URL${NC}"
    
    # Create a test script
    cat > test-railway-deployment.sh << EOF
#!/bin/bash
echo "🧪 Testing Railway MCP Adapter deployment"
echo "=========================================="

RAILWAY_URL="$RAILWAY_URL"

echo "🔍 Testing health endpoint..."
curl -s "https://\$RAILWAY_URL/health" | jq .

echo -e "\n🛠️ Testing tools endpoint..."
curl -s "https://\$RAILWAY_URL/tools" | jq '.tools | length'

echo -e "\n📡 Testing execute endpoint..."
curl -X POST "https://\$RAILWAY_URL/execute-sync" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tool": "browser_health",
    "arguments": {}
  }' | jq .

echo -e "\n✅ Test complete!"
EOF
    
    chmod +x test-railway-deployment.sh
    echo -e "\n${GREEN}✅ Test script created: test-railway-deployment.sh${NC}"
fi

echo -e "\n${GREEN}🎉 Deployment complete!${NC}"
echo -e "\n${YELLOW}💡 Next steps:${NC}"
echo -e "1. Test your deployment with the test script"
echo -e "2. Configure n8n to use the Railway URL"
echo -e "3. Update Claude Desktop MCP config"
echo -e "4. Monitor logs in Railway dashboard"

echo -e "\n${BLUE}📊 Monitor your deployment:${NC}"
echo -e "   railway logs"
echo -e "   railway status"

