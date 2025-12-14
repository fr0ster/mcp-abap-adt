/**
 * Help text for MCP ABAP ADT Server v2
 */

export function showHelp(): void {
  // From bin/help.js, package.json is in ../package.json
  const pkg = require('../package.json');
  console.log(`
MCP ABAP ADT Server v2 v${pkg.version}

Usage:
  mcp-abap-adt-v2 [options]

Options:
  --mcp=<destination>       MCP destination name (required)
                            Example: --mcp=TRIAL
  --transport=<type>        Transport type: stdio (default), sse, http
  --http-port=<port>        HTTP server port (default: 3000)
  --sse-port=<port>         SSE server port (default: 3001)
  --http-host=<host>        HTTP server host (default: 127.0.0.1 for local only, use 0.0.0.0 for all interfaces)
                            Security: When listening on 0.0.0.0, client must provide all connection headers
  --sse-host=<host>         SSE server host (default: 127.0.0.1 for local only, use 0.0.0.0 for all interfaces)
                            Security: When listening on 0.0.0.0, client must provide all connection headers
  --help, -h                Show this help message
  --version, -v             Show version number

Environment Variables:
  MCP_HTTP_PORT             HTTP server port (default: 3000)
  MCP_SSE_PORT              SSE server port (default: 3001)
  MCP_HTTP_HOST             HTTP server host (default: 127.0.0.1)
  MCP_SSE_HOST              SSE server host (default: 127.0.0.1)
  AUTH_BROKER_PATH          Custom paths for service keys and sessions
                            Unix: colon-separated (e.g., /path1:/path2)
                            Windows: semicolon-separated (e.g., C:\\path1;C:\\path2)
  AUTH_LOG_LEVEL            Handler logger level: error|warn|info|debug (default: info)

Examples:
  mcp-abap-adt-v2 --mcp=TRIAL                                    # Default stdio mode
  mcp-abap-adt-v2 --mcp=TRIAL --transport=sse                   # SSE mode on port 3001
  mcp-abap-adt-v2 --mcp=TRIAL --transport=sse --sse-port=8080    # SSE mode on custom port
  mcp-abap-adt-v2 --mcp=TRIAL --transport=http                   # HTTP mode on port 3000
  mcp-abap-adt-v2 --mcp=TRIAL --transport=http --http-port=8080 # HTTP mode on custom port
  mcp-abap-adt-v2 --mcp=TRIAL --transport=http --http-host=0.0.0.0 # HTTP mode accepting all interfaces

Notes:
  - v2 server uses Dependency Injection architecture
  - All transports support LOCAL mode (service keys + AuthBroker)
  - HTTP and SSE transports support REMOTE mode (client-provided headers) when host=0.0.0.0
  - Authentication: When starting, if authentication is required, browser will open automatically
`);
}

export function showVersion(): void {
  // From bin/help.js, package.json is in ../package.json
  const pkg = require('../package.json');
  console.log(`mcp-abap-adt-v2 v${pkg.version}`);
}
