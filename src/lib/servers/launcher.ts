import { CompositeHandlersRegistry } from "./handlers/registry/CompositeHandlersRegistry.js";
import {
  HighLevelHandlersGroup,
  LowLevelHandlersGroup,
  ReadOnlyHandlersGroup,
  SearchHandlersGroup,
} from "./handlers/groups/index.js";
import { StdioServer } from "./StdioServer.js";
import { StreamableHttpServer } from "./StreamableHttpServer.js";
import { SseServer } from "./SseServer.js";
import { AuthBrokerFactory } from "../authBrokerFactory.js";
import type { HandlerContext } from "../handlers/interfaces.js";

const stderrLogger = {
  info: (...args: any[]) => console.error(...args),
  warn: (...args: any[]) => console.error(...args),
  error: (...args: any[]) => console.error(...args),
  debug: (...args: any[]) => console.error(...args),
};

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const loggerForTransport = process.env.DEBUG_AUTH_LOG === "true" ? stderrLogger : silentLogger;

type Transport = "stdio" | "sse" | "http";

function getArgValue(name: string): string | undefined {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
    if (arg === name && i + 1 < args.length) return args[i + 1];
  }
  return undefined;
}

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

function parseTransport(): Transport {
  const value = getArgValue("--transport");
  if (value === "sse") return "sse";
  if (value === "http" || value === "streamable-http") return "http";
  return "stdio";
}

function showHelp(): void {
  const help = `
MCP ABAP ADT Server v2 - SAP ABAP Development Tools MCP Integration

USAGE:
  mcp-abap-adt-v2 [options]

DESCRIPTION:
  MCP server for interacting with SAP ABAP systems via ADT (ABAP Development Tools).
  Supports multiple transport modes: stdio (default), HTTP, and SSE.

TRANSPORT MODES:
  Default: stdio (for MCP clients like Cline, Cursor, Claude Desktop)
  HTTP:    --transport=http (for web interfaces, receives config via HTTP headers)
  SSE:     --transport=sse

OPTIONS:
  --help                           Show this help message

ENVIRONMENT FILE:
  --env=<path>                     Path to .env file (uses .env instead of auth-broker)
  --env <path>                     Alternative syntax for --env
  --auth-broker-path=<path>        Custom path for auth-broker service keys and sessions
                                   Creates service-keys and sessions subdirectories in this path
                                   Example: --auth-broker-path=~/prj/tmp/
                                   This will use ~/prj/tmp/service-keys and ~/prj/tmp/sessions
  --mcp=<destination>              Default MCP destination name (required for stdio mode)
                                   If specified, this destination will be used when x-mcp-destination
                                   header is not provided in the request
                                   Example: --mcp=TRIAL
                                   This allows using auth-broker with stdio and SSE transports
                                   When --mcp is specified, .env file is not loaded automatically
                                   (even if it exists in current directory)

TRANSPORT SELECTION:
  --transport=<type>               Transport type: stdio|http|streamable-http|sse
                                   Default: stdio (for MCP clients)

HTTP/STREAMABLE-HTTP OPTIONS:
  --host=<host>                    HTTP server host (default: 127.0.0.1 for local only)
                                   Use 0.0.0.0 for all interfaces
                                   Security: When listening on 0.0.0.0, client must provide all connection headers
                                   Server will not use default destination for non-local connections
  --port=<port>                    HTTP server port (default: 3000)
  --http-json-response             Enable JSON response format

SSE (SERVER-SENT EVENTS) OPTIONS:
  --host=<host>                    SSE server host (default: 127.0.0.1 for local only)
                                   Use 0.0.0.0 for all interfaces
                                   Security: When listening on 0.0.0.0, client must provide all connection headers
                                   Server will not use default destination for non-local connections
  --port=<port>                    SSE server port (default: 3001)

ENVIRONMENT VARIABLES:
  DEBUG_AUTH_LOG                   Enable debug logging for auth-broker (true|false)
                                   Default: false (only info messages shown)
                                   When true: shows detailed debug messages
  DEBUG_AUTH_BROKER                Alias for DEBUG_AUTH_LOG (true|false)
                                   Same as DEBUG_AUTH_LOG - enables debug logging for auth-broker
  AUTH_BROKER_PATH                 Custom paths for service keys and sessions
                                   Unix: colon-separated (e.g., /path1:/path2)
                                   Windows: semicolon-separated (e.g., C:\\\\path1;C:\\\\path2)
                                   If not set, uses platform defaults:
                                   Unix: ~/.config/mcp-abap-adt/service-keys
                                   Windows: %USERPROFILE%\\\\Documents\\\\mcp-abap-adt\\\\service-keys

SAP CONNECTION (.env file):
  SAP_URL                          SAP system URL (required)
                                   Example: https://your-system.sap.com
  SAP_CLIENT                       SAP client number (required)
                                   Example: 100
  SAP_AUTH_TYPE                    Authentication type: basic|jwt (default: basic)
  SAP_USERNAME                     SAP username (required for basic auth)
  SAP_PASSWORD                     SAP password (required for basic auth)
  SAP_JWT_TOKEN                    JWT token (required for jwt auth)

GENERATING .ENV FROM SERVICE KEY (JWT Authentication):
  To generate .env file from SAP BTP service key JSON file, install the
  connection package globally:

    npm install -g @mcp-abap-adt/connection

  Then use the sap-abap-auth command:

    sap-abap-auth auth -k path/to/service-key.json

  This will create/update .env file with JWT tokens and connection details.

EXAMPLES:
  # Default stdio mode with auth-broker (for MCP clients)
  mcp-abap-adt-v2 --mcp=TRIAL

  # Stdio mode with .env file
  mcp-abap-adt-v2 --env=.env

  # Stdio mode with .env file from custom path
  mcp-abap-adt-v2 --env=/path/to/my.env

  # HTTP mode (for web interfaces)
  mcp-abap-adt-v2 --transport=http

  # HTTP server on custom port, localhost only (default)
  mcp-abap-adt-v2 --transport=http --port=8080

  # HTTP server accepting connections from all interfaces (less secure)
  mcp-abap-adt-v2 --transport=http --host=0.0.0.0 --port=8080

  # Use custom path for auth-broker (creates service-keys and sessions subdirectories)
  mcp-abap-adt-v2 --auth-broker-path=~/prj/tmp/ --mcp=TRIAL

  # SSE transport with auth-broker
  mcp-abap-adt-v2 --transport=sse --mcp=TRIAL

  # SSE server on custom port
  mcp-abap-adt-v2 --transport=sse --port=3001 --mcp=TRIAL

QUICK REFERENCE:
  Transport types:
    stdio           - Standard input/output (default, for MCP clients, requires .env file or --mcp parameter)
    http            - HTTP StreamableHTTP transport (for web interfaces)
    streamable-http - Same as http
    sse             - Server-Sent Events transport

  Common use cases:
    MCP clients (Cline, Cursor):  mcp-abap-adt-v2 --mcp=TRIAL
    MCP clients with .env:        mcp-abap-adt-v2 --env=.env
    Web interfaces (HTTP):        mcp-abap-adt-v2 --transport=http
    SSE transport:                mcp-abap-adt-v2 --transport=sse --mcp=TRIAL
`;
  console.error(help);
}

async function main() {
  // Check for --help first
  if (hasArg("--help") || hasArg("-h")) {
    showHelp();
    process.exit(0);
  }

  const transport = parseTransport();
  const destination = getArgValue("--mcp");
  const envFilePath = getArgValue("--env");
  const host = getArgValue("--host") ?? "127.0.0.1";
  const portRaw = getArgValue("--port");
  const port = portRaw ? Number.parseInt(portRaw, 10) : transport === "http" ? 3000 : 3001;
  const enableJsonResponse = getArgValue("--http-json-response") === "true";
  const authBrokerPath = getArgValue("--auth-broker-path");

  const baseContext = { connection: undefined as any, logger: undefined } satisfies HandlerContext;
  const handlersRegistry = new CompositeHandlersRegistry([
    // SystemHandlersGroup duplicates some readonly tools (e.g., GetTypeInfo), so it's omitted here
    new ReadOnlyHandlersGroup(baseContext),
    new HighLevelHandlersGroup(baseContext),
    new LowLevelHandlersGroup(baseContext),
    new SearchHandlersGroup(baseContext),
  ]);

  const authBrokerFactory = new AuthBrokerFactory({
    defaultMcpDestination: destination,
    defaultDestination: destination,
    envFilePath,
    authBrokerPath,
    unsafe: false,
    transportType: transport,
    useAuthBroker: !envFilePath, // Use auth-broker only if no .env file specified
    logger: loggerForTransport,
  });

  // Initialize default broker (important for .env file support)
  await authBrokerFactory.initializeDefaultBroker();

  if (transport === "stdio") {
    if (!destination && !envFilePath) {
      throw new Error("stdio requires --mcp=<destination> or --env=<path>");
    }
    // For .env file, use 'default' broker; for --mcp, use specified destination
    const brokerKey = envFilePath ? 'default' : destination;
    const broker = await authBrokerFactory.getOrCreateAuthBroker(brokerKey);
    if (!broker) {
      throw new Error(`Auth broker not available for ${brokerKey ?? 'default'}`);
    }
    const server = new StdioServer(handlersRegistry, broker, { logger: loggerForTransport });
    await server.start(brokerKey ?? 'default');
    return;
  }

  if (transport === "sse") {
    const server = new SseServer(handlersRegistry, authBrokerFactory, {
      host,
      port,
      defaultDestination: envFilePath ? 'default' : destination,
      logger: loggerForTransport,
    });
    await server.start();
    return;
  }

  // http
  const server = new StreamableHttpServer(handlersRegistry, authBrokerFactory, {
    host,
    port,
    enableJsonResponse,
    defaultDestination: envFilePath ? 'default' : destination,
    logger: loggerForTransport,
  });
  await server.start();
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[MCP] launcher failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
