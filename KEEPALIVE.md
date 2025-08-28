# Server Keepalive Solutions

This document explains the comprehensive keepalive solutions implemented to prevent the Playwright MCP server from disconnecting randomly.

## 🚀 Implemented Solutions

### 1. **Process Monitoring & Automatic Restart**
- **Graceful shutdown handling** for SIGINT, SIGTERM, and SIGHUP signals
- **Uncaught exception handling** to prevent crashes
- **Unhandled rejection handling** for promise errors
- **Automatic browser cleanup** on shutdown

### 2. **Heartbeat & Keepalive Endpoints**
- **`/keepalive`** - Simple endpoint to ping the server and update last activity
- **`/health`** - Enhanced health check with detailed memory and uptime info
- **Activity tracking** - Server tracks last activity timestamp
- **Internal health checks** every 5 minutes

### 3. **Memory Management**
- **Garbage collection** - Automatic GC every 30 seconds (if available)
- **Memory monitoring** - Logs memory usage in heartbeat
- **Increased heap size** - 4GB for main server, 2GB for minimal
- **Memory pressure handling** - Browser args to reduce memory pressure

### 4. **Browser Connection Management**
- **Browser recycling** - Automatically restarts browser every 30 minutes
- **Retry logic** - Exponential backoff for browser launch failures
- **Connection validation** - Tests page responsiveness before use
- **Disconnection handling** - Recreates browser on disconnect events

### 5. **Enhanced Error Handling**
- **Page validation** - Checks if page is still responsive
- **Timeout management** - 30-second timeouts for operations
- **Retry mechanisms** - Up to 3 attempts for critical operations
- **Degraded mode** - Server continues running even if browser fails

## 🛠️ Usage Options

### Option 1: Enhanced Server (Recommended)
```bash
# Build and start with enhanced keepalive features
npm run build
npm start
```

### Option 2: Monitor Script
```bash
# Start server with external monitoring
npm run build
npm run start:monitor
```

### Option 3: External Keepalive Script
```bash
# Start server normally
npm run build
npm start

# In another terminal, run keepalive script
node keepalive.js [port] [interval_ms]
# Example: node keepalive.js 3000 300000 (5 minutes)
```

### Option 4: Minimal Server
```bash
# For lightweight deployments
npm run build
npm run start:minimal
```

## 📊 Monitoring Endpoints

### Health Check
```bash
curl http://localhost:3000/health
```
Returns detailed server status including:
- Memory usage (used/total/external/RSS)
- Uptime
- Last activity timestamp
- Shutdown status

### Keepalive
```bash
curl http://localhost:3000/keepalive
```
Simple endpoint that updates server activity timestamp.

### Browser Health
```bash
curl -X POST http://localhost:3000/execute-sync \
  -H "Content-Type: application/json" \
  -d '{"tool": "browser_health", "arguments": {}}'
```
Returns detailed browser status including:
- Browser connection status
- Page count and current URL
- Browser age and retry count
- Memory usage

## 🔧 Configuration

### Environment Variables
- `PORT` - Server port (default: 3000)
- `MODE` - Server mode: "http" or "stdio"
- `NODE_ENV` - Environment: "production" or "development"

### Railway Configuration
- **Restart Policy**: `always` (restarts on any failure)
- **Health Check**: `/health` endpoint with 120s timeout
- **Memory**: 4GB heap size with garbage collection

### Browser Settings
- **Headless mode** with optimized args
- **Memory pressure handling**
- **30-minute browser recycling**
- **Connection pooling and retry logic**

## 🚨 Troubleshooting

### Server Keeps Disconnecting
1. Check memory usage: `curl http://localhost:3000/health`
2. Monitor browser health: Use `browser_health` tool
3. Check logs for error patterns
4. Ensure sufficient system resources

### Browser Issues
1. Browser will auto-retry with exponential backoff
2. Server continues running in degraded mode if browser fails
3. Use `close_browser` tool to force browser restart
4. Check system dependencies for Playwright

### Memory Issues
1. Server automatically triggers garbage collection
2. Browser recycles every 30 minutes
3. Monitor memory usage via health endpoint
4. Consider reducing heap size if needed

## 📈 Performance Features

- **Connection tracking** - Logs new connections and disconnections
- **Activity monitoring** - Tracks last activity for idle detection
- **Resource optimization** - Browser args for minimal resource usage
- **Automatic cleanup** - Proper resource disposal on shutdown

## 🔄 Automatic Recovery

The server includes multiple layers of automatic recovery:

1. **Browser disconnection** → Auto-recreate on next request
2. **Page unresponsiveness** → Create new page with retry logic
3. **Memory pressure** → Automatic garbage collection
4. **Process crashes** → Railway restart policy
5. **Network issues** → Retry logic with exponential backoff

This comprehensive approach ensures the server stays alive and responsive even under challenging conditions.
