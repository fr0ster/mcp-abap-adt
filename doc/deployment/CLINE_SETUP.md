# Connecting Cline to MCP ABAP ADT via HTTP

This guide shows how to configure Cline to connect to MCP ABAP ADT server using HTTP on port 3000.

## Current Setup

Your server is configured with HTTP on port 3000:
- **HTTP on port 3000**: `http://localhost:3000/mcp/stream/http`

## Cline Configuration

### ⚠️ Common Issues

**Before troubleshooting, check these common mistakes:**

1. **`"disabled": true`** - This prevents Cline from connecting! Must be `false`.
2. **Missing path** - URL must include `/mcp/stream/http`, not just base URL.
3. **Wrong type** - Use `"type": "streamableHttp"`, not `"transport": "http"`.

### Basic Configuration

Add to your Cline configuration file:

**For VS Code / Cursor:**
- Location: `.vscode/mcp.json` or global settings
- Path: `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

**For Windsurf:**
- Path: `~/Library/Application Support/Windsurf/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

**Basic configuration:**
```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "url": "http://localhost:3000/mcp/stream/http",
      "type": "streamableHttp",
      "disabled": false
    }
  }
}
```

**With SAP connection headers (recommended):**
```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "url": "http://localhost:3000/mcp/stream/http",
      "type": "streamableHttp",
      "disabled": false,
      "timeout": 160,
      "headers": {
        "x-sap-url": "https://your-sap-system.abap.us10.hana.ondemand.com",
        "x-sap-auth-type": "jwt",
        "x-sap-jwt-token": "your_jwt_token_here",
        "x-sap-refresh-token": "your_refresh_token_here"
      }
    }
  }
}
```

**⚠️ IMPORTANT CHECKLIST:**
1. ✅ Set `"disabled": false` (not `true`) - this is critical!
2. ✅ URL must include `/mcp/stream/http` path
3. ✅ Use `"type": "streamableHttp"` (not `"transport": "http"`)
4. ✅ Use `http://` (not `https://`) for local development

## Testing the Connection

After configuring Cline, test the connection:

```bash
# Test with curl
curl -X POST http://localhost:3000/mcp/stream/http \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

If the server responds, the connection is working.

## Troubleshooting

### "fetch failed" Error

If Cline shows "fetch failed":
1. Check that the MCP server is running: `docker-compose ps`
2. Check MCP server logs: `docker logs mcp-abap-adt-server`
3. Verify the URL in Cline config matches exactly: `http://localhost:3000/mcp/stream/http`
4. Ensure `"disabled": false` in Cline config

### Connection Timeout

If you see connection timeouts:
1. Check that port 3000 is not blocked by firewall
2. Verify docker-compose is exposing port 3000: `docker-compose ps`
3. Test with curl (see above) to verify server is accessible

### Wrong Response Format

If you get wrong response format:
1. Ensure `"type": "streamableHttp"` (not `"transport": "http"`)
2. Check that Accept header includes `text/event-stream` (Cline should handle this automatically)

## Streaming Support

The MCP server supports streaming (chunked transfer encoding) directly. The server handles streaming responses without any proxy layer, ensuring optimal performance for real-time communication with Cline.

