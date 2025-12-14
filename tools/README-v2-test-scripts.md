# MCP Server v2 Test Scripts

Test scripts for running the new v2 server architecture with different transports.

## Prerequisites

1. Build the project:
   ```bash
   npm run build
   ```

2. Ensure you have service keys configured (for LOCAL mode):
   - Service keys should be in the standard location (e.g., `~/.sap/service-keys/`)
   - Or use environment variables

## Available Scripts

### Stdio Transport

Run server with stdio transport (for MCP Inspector or direct client connection):

```bash
npm run test:v2:stdio -- --mcp=my-destination
```

With MCP Inspector (recommended for testing):

```bash
npm run dev:v2:stdio -- --mcp=my-destination
```

This will:
- Start the v2 server with stdio transport
- Use LOCAL mode (service keys + AuthBroker)
- Connect to the specified destination
- Open MCP Inspector in browser for testing

### SSE Transport

Run server with SSE transport (for HTTP/SSE clients):

```bash
npm run test:v2:sse -- --mcp=my-destination [--port=3000]
```

With MCP Inspector:

```bash
npm run dev:v2:sse -- --mcp=my-destination [--port=3000]
```

This will:
- Start the v2 server with SSE transport
- Listen on `http://127.0.0.1:3000` (or specified port)
- Use LOCAL mode (service keys + AuthBroker)
- Connect to the specified destination

## Testing with MCP Inspector

The MCP Inspector is a web-based tool for testing MCP servers. It provides:
- Tool discovery and execution
- Request/response inspection
- Session management

### Using Inspector with stdio:

```bash
npm run dev:v2:stdio -- --mcp=my-destination
```

The inspector will automatically open in your browser.

**Note**: The script uses compiled JavaScript (not TypeScript) to avoid `ts-node` dependency issues with Inspector. The build step runs automatically before starting Inspector.

**Authentication**: When the server starts, if authentication is required, it will automatically open your default browser for authentication. This is handled by AuthBroker with `browser: 'system'` setting.

### Using Inspector with SSE:

1. Start the server:
   ```bash
   npm run test:v2:sse -- --mcp=my-destination
   ```

2. Open MCP Inspector manually:
   ```bash
   npx @modelcontextprotocol/inspector
   ```

3. Connect to: `http://127.0.0.1:3000/sse`

## Testing with Real Client

### Stdio Client

For stdio transport, clients typically connect via stdin/stdout:

```typescript
import { spawn } from 'child_process';

const server = spawn('npm', ['run', 'test:v2:stdio', '--', '--mcp=my-destination'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Send MCP requests to server.stdin
// Read responses from server.stdout
```

### SSE Client

For SSE transport, clients connect via HTTP:

```typescript
const eventSource = new EventSource('http://127.0.0.1:3000/sse');

eventSource.onmessage = (event) => {
  const message = JSON.parse(event.data);
  // Handle MCP message
};
```

## Architecture

The v2 server uses Dependency Injection (DI) architecture:

1. **LocalModeFactory**: Creates all LOCAL mode components
   - ServiceKeyStore (from @mcp-abap-adt/auth-stores)
   - SessionStore (from @mcp-abap-adt/auth-stores)
   - TokenProvider (from @mcp-abap-adt/auth-providers)
   - AuthBrokerFactory
   - LocalConnectionProvider

2. **McpServer**: Main server orchestrator
   - Transport (stdio/SSE/HTTP)
   - SessionManager
   - ConnectionProvider
   - ProtocolHandler
   - HandlersRegistry

3. **Handlers**: Tool handlers grouped by functionality
   - ReadOnlyHandlersGroup
   - HighLevelHandlersGroup
   - LowLevelHandlersGroup
   - SystemHandlersGroup
   - SearchHandlersGroup

## Troubleshooting

### "Destination required" error

Make sure to provide `--mcp=destination-name` parameter.

### "Service key not found" error

Ensure service keys are configured:
- Check `~/.sap/service-keys/` directory
- Or set environment variables
- Verify destination name matches service key file name

### Port already in use (SSE)

Specify a different port:
```bash
npm run test:v2:sse -- --mcp=my-destination --port=3001
```

### Connection refused (SSE client)

Ensure server is running and listening on the correct port:
```bash
# Check if server is running
curl http://127.0.0.1:3000/sse
```

## Next Steps

- Phase 4: REMOTE Mode Implementation
- Phase 5: Factory & Configuration (CLI/YAML/ServerLauncher)
- Phase 6: Testing & Integration
- Phase 7: Documentation & Polish
