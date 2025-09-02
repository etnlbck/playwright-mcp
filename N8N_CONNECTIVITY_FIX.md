# n8n/LangChain Connectivity Fix

## Problem

n8n was unable to connect to the MCP server, likely because it was making GET requests to check server availability before attempting to use the MCP protocol. The server only had POST endpoints for MCP protocol communication, causing connectivity checks to fail.

## Root Cause

Many tools that use LangChain (including n8n) follow a common pattern:
1. **First**: Make a GET request to check if the server is alive
2. **Then**: Use the actual protocol (POST requests for MCP)

The original server only had:
- `POST /mcp` - MCP protocol endpoint
- `GET /health` - Health check (but not commonly expected)
- `GET /keepalive` - Keep-alive endpoint

Missing common endpoints that tools expect:
- `GET /` - Root endpoint
- `GET /status` - Simple status check
- `GET /mcp` - Information about the MCP endpoint

## Solution Implemented

Added comprehensive GET endpoints that satisfy common connectivity check patterns:

### 1. Root Endpoint (`GET /`)
```json
{
  "name": "Playwright MCP Server",
  "version": "1.0.0",
  "status": "running",
  "protocol": "MCP (Model Context Protocol)",
  "endpoints": {
    "mcp": "POST /mcp - MCP protocol endpoint",
    "health": "GET /health - Health check",
    "tools": "GET /tools - List available tools",
    "ready": "GET /ready - Browser readiness check",
    "keepalive": "GET /keepalive - Keep-alive endpoint"
  },
  "timestamp": "2025-09-02T19:08:07.567Z",
  "uptime": 2.661073834
}
```

### 2. Status Endpoint (`GET /status`)
```json
{
  "status": "ok",
  "service": "playwright-mcp-server",
  "version": "1.0.0",
  "uptime": 2.77205025,
  "memory": {
    "used": 20,
    "total": 36
  },
  "timestamp": "2025-09-02T19:08:07.680Z"
}
```

### 3. MCP Info Endpoint (`GET /mcp`)
```json
{
  "protocol": "MCP (Model Context Protocol)",
  "version": "2025-06-18",
  "method": "POST",
  "description": "This endpoint accepts MCP protocol requests via POST",
  "example": {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  },
  "availableMethods": [
    "initialize",
    "tools/list",
    "tools/call",
    "resources/list",
    "prompts/list"
  ],
  "status": "ready",
  "timestamp": "2025-09-02T19:08:08.626Z"
}
```

### 4. Fixed Tools Endpoint (`GET /tools`)
Fixed the `/tools` endpoint to properly call `listTools()` instead of trying to call `tools/list` as a tool.

## Complete Endpoint List

The server now provides these GET endpoints:

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `GET /` | Root endpoint with server info | Server information and available endpoints |
| `GET /health` | Health check | Detailed health status with memory usage |
| `GET /status` | Simple status check | LangChain-compatible status response |
| `GET /tools` | List available tools | Array of all available MCP tools |
| `GET /ready` | Browser readiness check | Browser initialization status |
| `GET /keepalive` | Keep-alive endpoint | Simple alive status |
| `GET /mcp` | MCP protocol info | Information about MCP endpoint usage |

## Testing Results

All endpoints tested successfully:

```bash
✅ GET / - Server information
✅ GET /health - Health check  
✅ GET /status - Status check
✅ GET /tools - Tools list (11 tools including new discover_elements)
✅ GET /ready - Browser readiness
✅ GET /keepalive - Keep-alive
✅ GET /mcp - MCP protocol info
✅ POST /mcp - MCP protocol (9 tools available)
```

## Benefits

1. **n8n Compatibility**: n8n can now successfully connect and verify server availability
2. **LangChain Compatibility**: Tools using LangChain can perform standard connectivity checks
3. **Better Debugging**: Multiple endpoints provide different levels of server information
4. **Standard Compliance**: Follows common patterns expected by HTTP-based tools
5. **No False Positives**: All endpoints return proper status information

## Usage Examples

### For n8n/LangChain connectivity checks:
```bash
# Simple status check
curl http://localhost:3000/status

# Health check
curl http://localhost:3000/health

# Server information
curl http://localhost:3000/
```

### For MCP protocol usage:
```bash
# List tools
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}'
```

## Files Modified

- `src/mcp-http-server.ts`: Added comprehensive GET endpoints
- `test-n8n-connectivity.sh`: Test script to verify all endpoints

The server now provides proper connectivity endpoints that should resolve n8n connection issues! 🎉
