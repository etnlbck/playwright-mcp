# Railway MCP Adapter Deployment

This guide shows you how to deploy the Playwright MCP adapter to Railway for remote access via n8n or Claude Desktop.

## 🚀 **What This Provides**

- **HTTP Server** - Accessible via n8n, curl, or any HTTP client
- **MCP Server** - Accessible via Claude Desktop
- **Both running on Railway** - No local setup required

## 📋 **Deployment Steps**

### **Step 1: Build the Project**
```bash
npm run build
```

### **Step 2: Deploy to Railway**

#### **Option A: Using Railway CLI**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Deploy
railway up --service playwright-mcp-adapter
```

#### **Option B: Using Railway Dashboard**
1. Go to [Railway.app](https://railway.app)
2. Create a new project
3. Connect your GitHub repository
4. Use the `railway-mcp-adapter.toml` configuration

### **Step 3: Configure Environment Variables**
In Railway dashboard, set:
- `MODE=http`
- `NODE_ENV=production`
- `PORT=3000` (Railway will override this)
- `PLAYWRIGHT_HTTP_URL=http://localhost:3000`

### **Step 4: Deploy**
Railway will automatically:
- Build the project
- Install Playwright browsers
- Start the MCP adapter

## 🌐 **Usage After Deployment**

### **For n8n (HTTP Access)**
Your Railway app will be available at: `https://your-app.railway.app`

#### **n8n HTTP Request Node Configuration:**
- **Method:** POST
- **URL:** `https://your-app.railway.app/execute-sync`
- **Headers:** 
  ```json
  {
    "Content-Type": "application/json"
  }
  ```
- **Body:**
  ```json
  {
    "tool": "navigate",
    "arguments": {
      "url": "https://example.com",
      "waitUntil": "load"
    }
  }
  ```

#### **Available HTTP Endpoints:**
- `GET /health` - Server health check
- `GET /tools` - List available tools
- `POST /execute-sync` - Execute tools (for n8n)
- `POST /execute` - Execute tools with streaming
- `GET /keepalive` - Keep server alive
- `GET /ready` - Browser readiness check

### **For Claude Desktop (MCP Access)**
Update your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "playwright-railway-mcp": {
      "command": "node",
      "args": ["/path/to/your/railway/deployment/dist/railway-mcp-adapter.js"],
      "env": {
        "PLAYWRIGHT_HTTP_URL": "https://your-app.railway.app"
      }
    }
  }
}
```

## 🛠️ **Available Tools**

### **Navigation**
```json
{
  "tool": "navigate",
  "arguments": {
    "url": "https://example.com",
    "waitUntil": "load",
    "timeout": 30000
  }
}
```

### **Screenshot**
```json
{
  "tool": "screenshot",
  "arguments": {
    "fullPage": false,
    "quality": 90,
    "type": "png"
  }
}
```

### **Scrape Content**
```json
{
  "tool": "scrape",
  "arguments": {
    "selector": "h1",
    "attribute": "textContent",
    "multiple": false
  }
}
```

### **Click Element**
```json
{
  "tool": "click",
  "arguments": {
    "selector": "button.submit",
    "timeout": 5000
  }
}
```

### **Type Text**
```json
{
  "tool": "type",
  "arguments": {
    "selector": "input[name='email']",
    "text": "user@example.com",
    "delay": 100
  }
}
```

### **Wait for Element**
```json
{
  "tool": "wait_for",
  "arguments": {
    "selector": ".loading-complete",
    "timeout": 10000,
    "state": "visible"
  }
}
```

### **Get Current URL**
```json
{
  "tool": "get_url",
  "arguments": {}
}
```

### **Browser Health**
```json
{
  "tool": "browser_health",
  "arguments": {}
}
```

## 🧪 **Testing Your Deployment**

### **Test HTTP Endpoints**
```bash
# Health check
curl https://your-app.railway.app/health

# List tools
curl https://your-app.railway.app/tools

# Execute tool
curl -X POST https://your-app.railway.app/execute-sync \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "navigate",
    "arguments": {
      "url": "https://example.com",
      "waitUntil": "load"
    }
  }'
```

### **Test MCP Connection**
```bash
# Test MCP adapter locally (pointing to Railway)
PLAYWRIGHT_HTTP_URL=https://your-app.railway.app npm run start:http-adapter
```

## 📊 **Monitoring**

### **Railway Dashboard**
- View logs in real-time
- Monitor resource usage
- Check deployment status

### **Health Endpoints**
- `GET /health` - Server status and memory usage
- `GET /keepalive` - Keep server alive
- `GET /ready` - Browser readiness

### **Logs**
The Railway MCP adapter provides detailed logging:
- HTTP server startup
- MCP adapter connection
- Tool execution
- Error handling

## 🔧 **Troubleshooting**

### **Deployment Issues**
1. **Check Railway logs** for build errors
2. **Verify environment variables** are set correctly
3. **Ensure Playwright browsers** are installed

### **Connection Issues**
1. **Test HTTP endpoints** first
2. **Check Railway app URL** is correct
3. **Verify MCP configuration** in Claude Desktop

### **Browser Issues**
1. **Check browser health** endpoint
2. **Monitor memory usage** in Railway dashboard
3. **Restart deployment** if needed

## 💰 **Cost Considerations**

Railway pricing:
- **Free tier:** 500 hours/month
- **Pro tier:** $5/month for unlimited usage
- **Playwright browsers** add to deployment size

## 🎯 **Benefits of Railway Deployment**

1. **No local setup** required
2. **Always available** - no need to keep local server running
3. **Scalable** - Railway handles scaling automatically
4. **Easy sharing** - Share URL with team members
5. **Monitoring** - Built-in logging and metrics
6. **HTTPS** - Secure connections out of the box

## 🚀 **Quick Start**

1. **Deploy to Railway:**
   ```bash
   railway up --service playwright-mcp-adapter
   ```

2. **Get your Railway URL** from the dashboard

3. **Use in n8n:**
   - HTTP Request node → `https://your-app.railway.app/execute-sync`

4. **Use in Claude Desktop:**
   - Update MCP config with Railway URL

5. **Test:**
   ```bash
   curl https://your-app.railway.app/health
   ```

Your Playwright MCP adapter is now running in the cloud and accessible from anywhere! 🎉







