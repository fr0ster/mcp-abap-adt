/**
 * CLI help and version handling
 */

import fs from "fs";
import path from "path";

/**
 * Display help message
 */
export function showHelp(): void {
  const help = `
MCP ABAP ADT Server - SAP ABAP Development Tools MCP Integration

USAGE:
  mcp-abap-adt [options]

DESCRIPTION:
  MCP server for interacting with SAP ABAP systems via ADT (ABAP Development Tools).
  Supports multiple transport modes: HTTP (default), stdio, and SSE.

TRANSPORT MODES:
  Default: HTTP (can work without .env file, receives config via HTTP headers)
  stdio:   --transport=stdio (for MCP clients like Cline, Cursor, Claude Desktop)
  SSE:     --transport=sse

OPTIONS:
  --help                           Show this help message

ENVIRONMENT FILE:
  --env=<path>                     Path to .env file (uses .env instead of auth-broker)
  --env <path>                     Alternative syntax for --env
  --auth-broker                    Force use of auth-broker (service keys) instead of .env file
                                   Ignores .env file even if present in current directory
                                   By default, .env in current directory is used automatically (if exists)
  --auth-broker-path=<path>        Custom path for auth-broker service keys and sessions
                                   Creates service-keys and sessions subdirectories in this path
                                   Example: --auth-broker-path=~/prj/tmp/
                                   This will use ~/prj/tmp/service-keys and ~/prj/tmp/sessions
  --mcp=<destination>              Default MCP destination name (overrides x-mcp-destination header)
                                   If specified, this destination will be used when x-mcp-destination
                                   header is not provided in the request
                                   Example: --mcp=TRIAL
                                   This allows using auth-broker with stdio and SSE transports
                                   When --mcp is specified, .env file is not loaded automatically
                                   (even if it exists in current directory)

TRANSPORT SELECTION:
  --transport=<type>               Transport type: stdio|http|streamable-http|sse
                                   Default: http (streamable-http)
                                   Shortcuts: --http (same as --transport=http)
                                             --sse (same as --transport=sse)
                                             --stdio (same as --transport=stdio)

HTTP/STREAMABLE-HTTP OPTIONS:
  --http-port=<port>               HTTP server port (default: 3000)
  --http-host=<host>               HTTP server host (default: 0.0.0.0)
  --http-json-response             Enable JSON response format
  --http-allowed-origins=<list>    Comma-separated allowed origins for CORS
                                   Example: --http-allowed-origins=http://localhost:3000,https://example.com
  --http-allowed-hosts=<list>      Comma-separated allowed hosts
  --http-enable-dns-protection     Enable DNS rebinding protection

SSE (SERVER-SENT EVENTS) OPTIONS:
  --sse-port=<port>                SSE server port (default: 3001)
  --sse-host=<host>                SSE server host (default: 0.0.0.0)
  --sse-allowed-origins=<list>     Comma-separated allowed origins for CORS
                                   Example: --sse-allowed-origins=http://localhost:3000
  --sse-allowed-hosts=<list>       Comma-separated allowed hosts
  --sse-enable-dns-protection     Enable DNS rebinding protection

ENVIRONMENT VARIABLES:
  MCP_ENV_PATH                     Path to .env file
  MCP_SKIP_ENV_LOAD                Skip automatic .env loading (true|false)
  MCP_SKIP_AUTO_START              Skip automatic server start (true|false)
  MCP_TRANSPORT                    Transport type (stdio|http|sse)
                                   Default: http (streamable-http) if not specified
  MCP_HTTP_PORT                    Default HTTP port (default: 3000)
  MCP_HTTP_HOST                    Default HTTP host (default: 0.0.0.0)
  MCP_HTTP_ENABLE_JSON_RESPONSE   Enable JSON responses (true|false)
  MCP_HTTP_ALLOWED_ORIGINS         Allowed CORS origins (comma-separated)
  MCP_HTTP_ALLOWED_HOSTS           Allowed hosts (comma-separated)
  MCP_HTTP_ENABLE_DNS_PROTECTION   Enable DNS protection (true|false)
  MCP_SSE_PORT                     Default SSE port (default: 3001)
  MCP_SSE_HOST                     Default SSE host (default: 0.0.0.0)
  MCP_SSE_ALLOWED_ORIGINS          Allowed CORS origins for SSE (comma-separated)
  MCP_SSE_ALLOWED_HOSTS            Allowed hosts for SSE (comma-separated)
  MCP_SSE_ENABLE_DNS_PROTECTION    Enable DNS protection for SSE (true|false)
  AUTH_BROKER_PATH                 Custom paths for service keys and sessions
                                   Unix: colon-separated (e.g., /path1:/path2)
                                   Windows: semicolon-separated (e.g., C:\\path1;C:\\path2)
                                   If not set, uses platform defaults:
                                   Unix: ~/.config/mcp-abap-adt/service-keys
                                   Windows: %USERPROFILE%\\Documents\\mcp-abap-adt\\service-keys
  DEBUG_AUTH_LOG                   Enable debug logging for auth-broker (true|false)
                                   Default: false (only info messages shown)
                                   When true: shows detailed debug messages
  DEBUG_AUTH_BROKER                Alias for DEBUG_AUTH_LOG (true|false)
                                   Same as DEBUG_AUTH_LOG - enables debug logging for auth-broker
                                   When true: automatically sets DEBUG_AUTH_LOG=true
  DEBUG_HTTP_REQUESTS              Enable logging of HTTP requests and MCP calls (true|false)
                                   Default: false
                                   When true: logs all incoming HTTP requests, methods, URLs,
                                   headers (sensitive data redacted), and MCP JSON-RPC calls
                                   Also enabled by DEBUG_CONNECTORS=true
  DEBUG_CONNECTORS                  Enable debug logging for connection layer (true|false)
                                   Default: false
                                   When true: shows HTTP requests, CSRF tokens, cookies,
                                   session management, and connection details
                                   Also enables DEBUG_HTTP_REQUESTS automatically
  DEBUG_HANDLERS                    Enable debug logging for MCP handlers (true|false)
                                   Default: false
                                   When true: shows handler entry/exit, session state,
                                   lock handles, property validation
  DEBUG_CONNECTION_MANAGER          Enable debug logging for connection manager (true|false)
                                   Default: false
                                   When true: shows connection cache operations

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
  # Default HTTP mode (works without .env file)
  mcp-abap-adt

  # HTTP server on custom port
  mcp-abap-adt --http-port=8080

  # Use stdio mode (for MCP clients, requires .env file or --mcp parameter)
  mcp-abap-adt --transport=stdio

  # Use stdio mode with --mcp parameter (uses auth-broker, skips .env file)
  mcp-abap-adt --transport=stdio --mcp=TRIAL

  # Default: uses .env from current directory if exists, otherwise auth-broker
  mcp-abap-adt

  # Force use of auth-broker (service keys), ignore .env file even if exists
  mcp-abap-adt --auth-broker

  # Use custom path for auth-broker (creates service-keys and sessions subdirectories)
  mcp-abap-adt --auth-broker --auth-broker-path=~/prj/tmp/

  # Use SSE transport with --mcp parameter (allows auth-broker with SSE transport)
  mcp-abap-adt --transport=sse --mcp=TRIAL

  # Use .env file from custom path
  mcp-abap-adt --env=/path/to/my.env

  # Start HTTP server with CORS enabled
  mcp-abap-adt --transport=http --http-port=3000 \\
                --http-allowed-origins=http://localhost:3000,https://example.com

  # Start SSE server on custom port
  mcp-abap-adt --transport=sse --sse-port=3001

  # Start SSE server with CORS and DNS protection
  mcp-abap-adt --transport=sse --sse-port=3001 \\
                --sse-allowed-origins=http://localhost:3000 \\
                --sse-enable-dns-protection

  # Using shortcuts
  mcp-abap-adt --http --http-port=8080
  mcp-abap-adt --sse --sse-port=3001

QUICK REFERENCE:
  Transport types:
    http            - HTTP StreamableHTTP transport (default)
    streamable-http - Same as http
    stdio           - Standard input/output (for MCP clients, requires .env file or --mcp parameter)
    sse             - Server-Sent Events transport

  Common use cases:
    Web interfaces (HTTP):        mcp-abap-adt (default, no .env needed)
    MCP clients (Cline, Cursor):  mcp-abap-adt --transport=stdio
    MCP clients with auth-broker: mcp-abap-adt --transport=stdio --mcp=TRIAL (skips .env)
    Web interfaces (SSE):         mcp-abap-adt --transport=sse --sse-port=3001
    SSE with auth-broker:         mcp-abap-adt --transport=sse --mcp=TRIAL (skips .env)

DOCUMENTATION:
  https://github.com/fr0ster/mcp-abap-adt
  Installation:    doc/installation/INSTALLATION.md
  Configuration:   doc/user-guide/CLIENT_CONFIGURATION.md
  Available Tools: doc/user-guide/AVAILABLE_TOOLS.md

AUTHENTICATION:
  For JWT authentication with SAP BTP service keys:
  1. Install: npm install -g @mcp-abap-adt/connection
  2. Run:     sap-abap-auth auth -k path/to/service-key.json
  3. This generates .env file with JWT tokens automatically

SERVICE KEYS (Destination-Based Authentication):
  The server supports destination-based authentication using service keys stored locally.
  This allows you to configure authentication once per destination and reuse it.

  IMPORTANT: Auth-broker (service keys) is only available for HTTP/streamable-http transport.
  For stdio and SSE transports, use .env file instead.

  How to Save Service Keys:

  Linux:
    1. Create service keys directory:
       mkdir -p ~/.config/mcp-abap-adt/service-keys

    2. Download service key from SAP BTP (from the corresponding service instance)
       and copy it to: ~/.config/mcp-abap-adt/service-keys/{destination}.json
       (e.g., TRIAL.json - the filename without .json extension becomes the destination name)

    Storage locations:
      Service keys: ~/.config/mcp-abap-adt/service-keys/{destination}.json
      Sessions:     ~/.config/mcp-abap-adt/sessions/{destination}.env

  macOS:
    1. Create service keys directory:
       mkdir -p ~/.config/mcp-abap-adt/service-keys

    2. Download service key from SAP BTP (from the corresponding service instance)
       and copy it to: ~/.config/mcp-abap-adt/service-keys/{destination}.json
       (e.g., TRIAL.json - the filename without .json extension becomes the destination name)

    Storage locations:
      Service keys: ~/.config/mcp-abap-adt/service-keys/{destination}.json
      Sessions:     ~/.config/mcp-abap-adt/sessions/{destination}.env

  Windows:
    1. Create service keys directory (PowerShell):
       New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\\Documents\\mcp-abap-adt\\service-keys"

    2. Download service key from SAP BTP (from the corresponding service instance)
       and copy it to: %USERPROFILE%\\Documents\\mcp-abap-adt\\service-keys\\{destination}.json
       (e.g., TRIAL.json - the filename without .json extension becomes the destination name)

    Or using Command Prompt (cmd):
       mkdir "%USERPROFILE%\\Documents\\mcp-abap-adt\\service-keys"
       (Then copy the downloaded service key file to this directory)

    Storage locations:
      Service keys: %USERPROFILE%\\Documents\\mcp-abap-adt\\service-keys\\{destination}.json
      Sessions:     %USERPROFILE%\\Documents\\mcp-abap-adt\\sessions\\{destination}.env

  Fallback: Server also searches in current working directory (where server is launched)

  Service Key:
    Download the service key JSON file from SAP BTP (from the corresponding service instance)
    and save it as {destination}.json (e.g., TRIAL.json).
    The filename without .json extension becomes the destination name (case-sensitive).

  Using Destinations:
    In HTTP headers, use:
      x-sap-destination: TRIAL    (for SAP Cloud, URL derived from service key)
      x-mcp-destination: TRIAL    (for MCP destinations, URL derived from service key)

    The destination name must exactly match the service key filename (without .json extension, case-sensitive).

    Example Cline configuration (~/.cline/mcp.json):
      {
        "mcpServers": {
          "mcp-abap-adt": {
            "command": "npx",
            "args": ["-y", "@mcp-abap-adt/server", "--transport=http", "--http-port=3000"],
            "env": {}
          }
        }
      }

      Then in Cline, use destination in requests:
        Headers: x-sap-destination: TRIAL

  First-Time Authentication:
    - Server reads service key from {destination}.json
    - Opens browser for OAuth2 authentication (if no valid session exists)
    - Saves tokens to {destination}.env for future use
    - Subsequent requests use cached tokens automatically

  Automatic Token Management:
    - Validates tokens before use
    - Refreshes expired tokens using refresh tokens
    - Caches valid tokens for performance
    - Falls back to browser authentication if refresh fails

  Custom Paths:
    Set AUTH_BROKER_PATH environment variable to override default paths:
      Linux/macOS: export AUTH_BROKER_PATH="/custom/path:/another/path"
      Windows:     set AUTH_BROKER_PATH=C:\\custom\\path;C:\\another\\path

    Or use --auth-broker-path command-line option:
      mcp-abap-adt --auth-broker --auth-broker-path=~/prj/tmp/
      This creates service-keys and sessions subdirectories in the specified path.

  For more details, see: doc/user-guide/CLIENT_CONFIGURATION.md#destination-based-authentication

`;
  console.log(help);
  process.exit(0);
}

/**
 * Show version from package.json
 */
export function showVersion(dirname: string): void {
  const packageJsonPath = path.join(dirname, "..", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  console.log(packageJson.version);
  process.exit(0);
}

/**
 * Handle CLI flags for help and version
 */
export function handleCliFlags(dirname: string): void {
  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    showVersion(dirname);
  }

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
  }
}
