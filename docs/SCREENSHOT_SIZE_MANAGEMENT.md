# Screenshot Size Management for Claude Desktop

## Problem Solved

Claude Desktop was experiencing issues with screenshots being too large to send back as resources in MCP responses. Large screenshots (especially full-page captures) can exceed size limits and cause failures.

## Root Cause

- Screenshots were being converted to base64 and sent directly in MCP responses
- No size limits or compression options were available
- Large screenshots could exceed Claude Desktop's response size limits
- No alternative delivery methods for oversized images

## Solutions Implemented

### 1. **Enhanced Screenshot Tool Parameters**

Added new parameters to the screenshot tool:

```typescript
{
  fullPage: boolean,           // Capture full page (default: false)
  quality: number,             // JPEG quality 0-100
  type: "png" | "jpeg",        // Image format (default: "png")
  maxSize: number,             // Maximum size in bytes (default: 2MB)
  compress: boolean,           // Auto-compress if too large (default: true)
  saveToFile: boolean          // Save to file instead of base64 (default: false)
}
```

### 2. **Automatic Compression**

When a screenshot exceeds the size limit and compression is enabled:

- **JPEG**: Tries quality levels: 80, 60, 40, 20
- **PNG**: Converts to JPEG with quality levels: 80%, 60%, 40%, 20%
- Logs compression progress for debugging
- Stops when size is within limits

### 3. **File Saving Option**

When screenshots are still too large after compression:

- Saves to `./screenshots/` directory
- Generates timestamped filenames
- Returns file path and HTTP URL
- Provides size information

### 4. **HTTP File Serving**

Added new endpoint to serve saved screenshots:

```
GET /screenshots/:filename
```

Features:
- Security checks (prevents path traversal)
- Proper content-type headers
- Caching headers (1 hour)
- Error handling

### 5. **Helpful Error Messages**

When screenshots are too large, provides actionable suggestions:

```
❌ Screenshot too large: 4KB (limit: 1KB)

💡 Suggestions:
- Use saveToFile: true to save to disk
- Reduce quality or use JPEG format
- Take a smaller screenshot (disable fullPage)
- Increase maxSize parameter
```

## Usage Examples

### Normal Screenshot (within size limits)
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "screenshot",
      "arguments": {
        "fullPage": false,
        "type": "png"
      }
    }
  }'
```

### Screenshot with Size Management
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "screenshot",
      "arguments": {
        "fullPage": true,
        "type": "jpeg",
        "maxSize": 1000000,
        "compress": true
      }
    }
  }'
```

### Save Large Screenshot to File
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "screenshot",
      "arguments": {
        "fullPage": true,
        "type": "jpeg",
        "maxSize": 500000,
        "saveToFile": true
      }
    }
  }'
```

## Test Results

✅ **Size Limit Enforcement**: Screenshots larger than maxSize are properly handled
✅ **Automatic Compression**: Large screenshots are compressed automatically
✅ **File Saving**: Large screenshots can be saved to disk with HTTP URLs
✅ **Error Messages**: Clear, actionable error messages with suggestions
✅ **HTTP Serving**: Screenshot files can be served via HTTP endpoint

## Benefits

1. **Claude Desktop Compatibility**: No more oversized screenshot failures
2. **Flexible Options**: Multiple ways to handle large screenshots
3. **Automatic Management**: Smart compression and fallback options
4. **Better UX**: Clear error messages and suggestions
5. **HTTP Access**: Screenshots can be accessed via HTTP URLs
6. **Configurable**: All limits and options are customizable

## Files Modified

- `src/server.ts`: Enhanced screenshot tool with size management
- `src/mcp-http-server.ts`: Added screenshot file serving endpoint
- `test-screenshot-size-management.sh`: Test script for new features

## Default Settings

- **Max Size**: 2MB (2,097,152 bytes)
- **Compression**: Enabled by default
- **File Saving**: Disabled by default
- **Format**: PNG by default, JPEG for compression

The screenshot tool now handles large images gracefully and provides multiple options for Claude Desktop to work with screenshots of any size! 🎉

