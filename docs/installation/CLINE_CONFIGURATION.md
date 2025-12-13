# Cline MCP Configuration

This guide shows how to configure Cline to connect to the MCP ABAP ADT server using different transport protocols.

## Prerequisites

1. Build the project:
```bash
npm run build
```

2. Prepare your `.env` file with SAP credentials (required for stdio and SSE):
```env
SAP_URL=https://your-sap-system.com
SAP_CLIENT=100
SAP_USER=your-username
SAP_PASSWORD=your-password
# or for JWT authentication:
# SAP_AUTH_TYPE=jwt
# SAP_JWT_TOKEN=your-jwt-token
```

## Configuration Files

Cline reads MCP server configurations from:
- **VS Code**: `.vscode/mcp.json` or global settings
- **Cursor**: `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Windsurf**: `~/Library/Application Support/Windsurf/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

## Installation Method

### Using NPM Package (Recommended)

If you installed via npm:
```bash
npm install -g @fr0ster/mcp-abap-adt
# or
npx @fr0ster/mcp-abap-adt
```

Use the simpler configurations below (no need to specify full paths).

### Using Local Development

If you cloned the repository and are developing locally, use the full path configurations.

## Transport Options

### Option 1: STDIO (Recommended for Cline)

**Best for**: Local development, maximum compatibility with MCP clients

#### A. Using NPX (No Installation Required)

**Recommended for most users**. NPX downloads and runs the latest version:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "npx",
      "args": [
        "-y",
        "@fr0ster/mcp-abap-adt",
        "--transport=stdio",
        "--env=/absolute/path/to/.env"
      ],
      "env": {},
      "disabled": false
    }
  }
}
```

**Example** (macOS/Linux):
```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "npx",
      "args": [
        "-y",
        "@fr0ster/mcp-abap-adt",
        "--transport=stdio",
        "--env=/Users/username/.env"
      ],
      "env": {},
      "disabled": false
    }
  }
}
```

**Example** (Windows):
```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "npx",
      "args": [
        "-y",
        "@fr0ster/mcp-abap-adt",
        "--transport=stdio",
        "--env=C:/Users/username/.env"
      ],
      "env": {},
      "disabled": false
    }
  }
}
```

#### B. Using Global Installation

If you installed globally (`npm install -g @fr0ster/mcp-abap-adt`):

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "mcp-abap-adt",
      "args": [
        "--transport=stdio",
        "--env=/absolute/path/to/.env"
      ],
      "env": {},
      "disabled": false
    }
  }
}
```

#### C. Using Local Development (Repository Clone)

For developers working on the source code:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-abap-adt/bin/mcp-abap-adt.js",
        "--transport=stdio",
        "--env=/absolute/path/to/mcp-abap-adt/.env"
      ],
      "env": {},
      "disabled": false
    }
  }
}
```

### Option 2: HTTP (Streamable HTTP)

**Best for**: Remote connections, web interfaces, multiple clients

#### Step 1: Start the HTTP Server

Choose one method:

**A. Using NPX** (recommended):
```bash
npx @fr0ster/mcp-abap-adt --transport=http --http-port=3000
```

**B. Using Global Install**:
```bash
mcp-abap-adt --transport=http --http-port=3000
```

**C. Using NPM Script** (local development):
```bash
npm run start:http
```

#### Step 2: Configure Cline

Same config for all installation methods:

```json
{
  "mcpServers": {
    "mcp-abap-adt-http": {
      "url": "http://localhost:3000",
      "transport": "http",
      "disabled": false
    }
  }
}
```

**With Custom Port**:
```json
{
  "mcpServers": {
    "mcp-abap-adt-http": {
      "url": "http://localhost:8080",
      "transport": "http",
      "disabled": false
    }
  }
}
```

**Note**: HTTP mode can work without `.env` file if you provide SAP credentials via HTTP headers in each request.

### Option 3: SSE (Server-Sent Events)

**Best for**: Long-running connections, real-time updates

#### Step 1: Start the SSE Server

Choose one method:

**A. Using NPX** (recommended):
```bash
npx @fr0ster/mcp-abap-adt --transport=sse --sse-port=3001 --env=/path/to/.env
```

**B. Using Global Install**:
```bash
mcp-abap-adt --transport=sse --sse-port=3001 --env=/path/to/.env
```

**C. Using NPM Script** (local development):
```bash
npm run start:sse
```

#### Step 2: Configure Cline

Same config for all installation methods:

```json
{
  "mcpServers": {
    "mcp-abap-adt-sse": {
      "url": "http://localhost:3001",
      "transport": "sse",
      "disabled": false
    }
  }
}
```

**With Custom Port**:
```json
{
  "mcpServers": {
    "mcp-abap-adt-sse": {
      "url": "http://localhost:8081",
      "transport": "sse",
      "disabled": false
    }
  }
}
```

## Platform-Specific Notes

### macOS/Linux

Use absolute paths in configuration. You can use `pwd` to get current directory:
```bash
cd /path/to/mcp-abap-adt
echo "$(pwd)/bin/mcp-abap-adt.js"
```

### Windows

Use Windows-style paths with forward slashes or escaped backslashes:
```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "node",
      "args": [
        "C:/Users/username/projects/mcp-abap-adt/bin/mcp-abap-adt.js",
        "--transport=stdio",
        "--env=C:/Users/username/projects/mcp-abap-adt/.env"
      ],
      "env": {},
      "disabled": false
    }
  }
}
```

Or with escaped backslashes:
```json
"args": [
  "C:\\Users\\username\\projects\\mcp-abap-adt\\bin\\mcp-abap-adt.js",
  "--transport=stdio"
]
```

## Testing Connection

1. **Restart Cline** after updating configuration
2. **Open Cline panel** in your editor
3. **Check available tools** - you should see ABAP tools like:
   - `abap_get_class`
   - `abap_get_program`
   - `abap_create_package`
   - etc.

4. **Try a simple command**:
   ```
   Get the source code of class ZCL_HELLO_WORLD
   ```

## Troubleshooting

### "Server not found" or "Connection failed"

1. Check that paths are absolute (not relative)
2. Verify `npm run build` was successful
3. Check that `dist/index.js` exists
4. For stdio: Verify `.env` file exists and has correct SAP credentials

### "No tools available" or empty response

1. Check server logs in terminal where server is running
2. Verify SAP credentials in `.env` are correct
3. Test connection manually:
   ```bash
   # For stdio:
   echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node ./dist/index.js --transport=stdio --env=.env
   
   # For HTTP:
   curl -X POST http://localhost:3000/mcp/v1/tools/list
   ```

### Windows-specific issues

1. Use `spawn()` instead of direct execution (already handled by `bin/mcp-abap-adt.js`)
2. Check for `\r\n` line ending issues in `.env` file
3. Use PowerShell or CMD with proper encoding (UTF-8)

## Multiple Server Instances

You can run multiple instances with different SAP systems:

```json
{
  "mcpServers": {
    "mcp-abap-dev": {
      "command": "node",
      "args": [
        "/path/to/mcp-abap-adt/bin/mcp-abap-adt.js",
        "--transport=stdio",
        "--env=/path/to/dev.env"
      ],
      "env": {},
      "disabled": false
    },
    "mcp-abap-prod": {
      "command": "node",
      "args": [
        "/path/to/mcp-abap-adt/bin/mcp-abap-adt.js",
        "--transport=stdio",
        "--env=/path/to/prod.env"
      ],
      "env": {},
      "disabled": false
    }
  }
}
```

## Advanced Options

### Custom Ports

```bash
# HTTP
node ./bin/mcp-abap-adt.js --transport=http --http-port=8080 --http-host=0.0.0.0

# SSE
node ./bin/mcp-abap-adt.js --transport=sse --sse-port=8081 --sse-host=0.0.0.0
```

### CORS Configuration

```bash
node ./bin/mcp-abap-adt.js --transport=http \
  --http-allowed-origins=http://localhost:3000,https://example.com \
  --http-enable-dns-protection
```

### Environment Variables

Instead of command-line arguments, you can use environment variables:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "node",
      "args": ["/path/to/mcp-abap-adt/bin/mcp-abap-adt.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "MCP_ENV_PATH": "/path/to/.env",
        "MCP_ENABLE_SESSION_STORAGE": "true",
        "MCP_SESSION_DIR": "/custom/sessions/path"
      },
      "disabled": false
    }
  }
}
```

**Available Environment Variables**:

| Variable | Description | Default | Platform Notes |
|----------|-------------|---------|----------------|
| `MCP_TRANSPORT` | Transport type: stdio, http, sse | `stdio` (if piped) or `http` | All platforms |
| `MCP_ENV_PATH` | Path to .env file | `./.env` | Use absolute paths |
| `MCP_ENABLE_SESSION_STORAGE` | Enable persistent sessions | `false` (disabled) | All platforms |
| `MCP_SESSION_DIR` | Custom session storage directory | OS temp dir | Platform-specific defaults:<br>• Windows: `%TEMP%\mcp-abap-adt-sessions`<br>• Linux: `/tmp/mcp-abap-adt-sessions`<br>• macOS: `/var/folders/.../mcp-abap-adt-sessions` |
| `MCP_HTTP_PORT` | HTTP server port | `3000` | All platforms |
| `MCP_SSE_PORT` | SSE server port | `3001` | All platforms |

**Session Storage**:

By default, session storage is **disabled** (stateless mode - each request creates a fresh connection).

**Enable for persistent sessions** (cookies, CSRF tokens survive across requests):
```json
{
  "env": {
    "MCP_ENABLE_SESSION_STORAGE": "true"
  }
}
```

**Custom session directory**:
```json
{
  "env": {
    "MCP_SESSION_DIR": "/absolute/path/to/sessions"
  }
}
```

**When to enable session storage**:
- ✅ Long-running operations requiring multiple requests
- ✅ Working with locked objects across multiple tool calls
- ❌ Simple read-only queries (adds overhead)
- ❌ Multiple parallel clients (each needs unique session dir)

## Security Notes

1. **Never commit** `.env` files with credentials to git
2. **Use JWT authentication** for production environments
3. **Enable DNS protection** for HTTP/SSE servers exposed to network
4. **Use HTTPS** in production (configure reverse proxy)

## Next Steps

- See [AVAILABLE_TOOLS.md](../user-guide/AVAILABLE_TOOLS.md) for list of all tools
- See [CLIENT_CONFIGURATION.md](../user-guide/CLIENT_CONFIGURATION.md) for more client examples
- See [CROSS_PLATFORM_FIXES.md](../development/CROSS_PLATFORM_FIXES.md) for troubleshooting
