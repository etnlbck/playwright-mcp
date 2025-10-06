# Railway Deployment - Fixed for Playwright

This guide shows how to deploy your Playwright MCP server to Railway with proper browser support.

## 🐳 **Fixed Dockerfile**

The main issue was that the Dockerfile had `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` which prevented browser installation. Here's what was fixed:

### **Key Changes:**

1. **Removed browser download skip**: Removed `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`
2. **Added system dependencies**: Added all required libraries for Playwright
3. **Added environment variables**: Set proper Playwright paths and validation skip
4. **Enhanced browser installation**: Added both browser and dependency installation

### **Updated Dockerfile:**

```dockerfile
FROM node:22-slim

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    gnupg \
    ca-certificates \
    procps \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libasound2 \
    libatspi2.0-0 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production --ignore-scripts

# Install dev dependencies for build
RUN npm ci --ignore-scripts

# Install Playwright with Chromium and dependencies
RUN npx playwright install chromium --with-deps
RUN npx playwright install-deps chromium

# Copy source code and startup script
COPY src/ ./src/
COPY start.sh ./

# Make startup script executable
RUN chmod +x start.sh

# Build TypeScript
RUN npm run build

# Remove dev dependencies and source files to reduce image size
RUN npm prune --production
RUN rm -rf src/ tsconfig.json node_modules/.cache

# Create non-root user for security
RUN groupadd -r playwright && useradd -r -g playwright -G audio,video playwright \
    && mkdir -p /home/playwright/.cache \
    && chown -R playwright:playwright /home/playwright \
    && chown -R playwright:playwright /app

# Set up proper permissions for Playwright
RUN chmod -R 755 /app
RUN chmod -R 755 /home/playwright

USER playwright

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["./start.sh"]
```

## 🚀 **Railway Configuration**

### **Option 1: Use the provided railway-playwright.toml**

```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "./start.sh"
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "on_failure"

[env]
MODE = "http"
PORT = "3000"
PLAYWRIGHT_BROWSERS_PATH = "/ms-playwright"
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true"

[resources]
memory = "1GB"
cpu = "0.5"
```

### **Option 2: Manual Railway Setup**

1. **Connect your repository to Railway**
2. **Set environment variables:**
   - `MODE=http`
   - `PORT=3000`
   - `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`
   - `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true`

3. **Configure resources:**
   - Memory: 1GB (minimum)
   - CPU: 0.5 cores

## 🧪 **Testing the Fix**

### **Local Docker Test:**

```bash
# Test the Docker build locally
./test-docker-build.sh
```

### **Railway Deployment Test:**

1. **Deploy to Railway**
2. **Check the logs** for browser installation success
3. **Test the health endpoint**: `https://your-app.railway.app/health`
4. **Test MCP endpoint**: 
   ```bash
   curl -X POST https://your-app.railway.app/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test-client", "version": "1.0.0"}}}'
   ```

## 🔧 **Troubleshooting**

### **If browsers still don't work:**

1. **Check Railway logs** for browser installation errors
2. **Verify environment variables** are set correctly
3. **Check memory allocation** - Playwright needs at least 1GB
4. **Test locally first** with the Docker test script

### **Common Issues:**

- **Memory issues**: Increase Railway memory allocation to 1GB+
- **Permission issues**: The Dockerfile sets proper permissions
- **Missing dependencies**: All required system libraries are installed
- **Browser path issues**: Environment variables point to correct paths

## 📊 **Expected Logs**

When working correctly, you should see:

```
🚀 Starting Playwright MCP Server...
📦 Playwright installation check:
  ✅ Playwright browsers found in /ms-playwright
🔧 Launching Chromium browser...
✅ Chromium browser launched successfully in 2341ms
🎉 Server successfully started and listening on port 3000
```

## 🎯 **Claude Desktop Configuration**

Once deployed, use this configuration:

```json
{
  "mcpServers": {
    "playwright-mcp": {
      "command": "npx",
      "args": ["mcp-remote", "https://your-app.railway.app/mcp"]
    }
  }
}
```

## ✅ **Success Indicators**

- ✅ Health endpoint returns 200
- ✅ MCP initialize returns server info
- ✅ Browser health shows `browserConnected: true`
- ✅ Navigation and screenshot tools work
- ✅ No "Browser is not available" errors

The fixed Dockerfile should resolve the Railway deployment issues and provide full Playwright functionality in the cloud! 🎉
