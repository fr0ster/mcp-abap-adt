// Utility functions for MCP ABAP ADT Server

import { SapConfig, AbapConnection } from "@mcp-abap-adt/connection";
import { setConfigOverride, setConnectionOverride } from "../../lib/utils";

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
  Default: stdio (for MCP clients like Cline, Cursor, Claude Desktop)
  HTTP:    --transport=http (for web interfaces, receives config via HTTP headers)
  SSE:     --transport=sse

OPTIONS:
  --help                           Show this help message
  --config=<path>                  Path to YAML configuration file
                                   If file doesn't exist, generates a template and exits
                                   Command-line arguments override YAML values
                                   Example: --config=config.yaml

YAML CONFIGURATION:
  Instead of passing many command-line arguments, you can use a YAML config file:

    mcp-abap-adt --config=config.yaml

  If the file doesn't exist, a template will be generated automatically and the command will exit.
  Edit the template to configure your server settings, then run the command again.

  The YAML file is validated on load - invalid configurations will cause the command to exit with an error.

  Command-line arguments always override YAML values for flexibility.

  See docs/configuration/YAML_CONFIG.md for detailed documentation.

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
                                   Default: stdio (for MCP clients)
                                   Shortcuts: --http (same as --transport=http)
                                             --sse (same as --transport=sse)
                                             --stdio (same as --transport=stdio)

HTTP/STREAMABLE-HTTP OPTIONS:
  --http-port=<port>               HTTP server port (default: 3000)
  --http-host=<host>               HTTP server host (default: 127.0.0.1 for local only, use 0.0.0.0 for all interfaces)
                                   Security: When listening on 0.0.0.0, client must provide all connection headers
                                   Server will not use default destination for non-local connections
  --http-json-response             Enable JSON response format
  --http-allowed-origins=<list>    Comma-separated allowed origins for CORS
                                   Example: --http-allowed-origins=http://localhost:3000,https://example.com
  --http-allowed-hosts=<list>      Comma-separated allowed hosts
  --http-enable-dns-protection     Enable DNS rebinding protection

SSE (SERVER-SENT EVENTS) OPTIONS:
  --sse-port=<port>                SSE server port (default: 3001)
  --sse-host=<host>                SSE server host (default: 127.0.0.1 for local only, use 0.0.0.0 for all interfaces)
                                   Security: When listening on 0.0.0.0, client must provide all connection headers
                                   Server will not use default destination for non-local connections
  --sse-allowed-origins=<list>     Comma-separated allowed origins for CORS
                                   Example: --sse-allowed-origins=http://localhost:3000
  --sse-allowed-hosts=<list>       Comma-separated allowed hosts
  --sse-enable-dns-protection     Enable DNS rebinding protection

ENVIRONMENT VARIABLES:
  MCP_ENV_PATH                     Path to .env file
  MCP_SKIP_ENV_LOAD                Skip automatic .env loading (true|false)
  MCP_SKIP_AUTO_START              Skip automatic server start (true|false)
  MCP_TRANSPORT                    Transport type (stdio|http|sse)
                                   Default: stdio if not specified
  MCP_HTTP_PORT                    Default HTTP port (default: 3000)
  MCP_HTTP_HOST                    Default HTTP host (default: 127.0.0.1 for local only, use 0.0.0.0 for all interfaces)
  MCP_HTTP_ENABLE_JSON_RESPONSE   Enable JSON responses (true|false)
  MCP_HTTP_ALLOWED_ORIGINS         Allowed CORS origins (comma-separated)
  MCP_HTTP_ALLOWED_HOSTS           Allowed hosts (comma-separated)
  MCP_HTTP_ENABLE_DNS_PROTECTION   Enable DNS protection (true|false)
  MCP_SSE_PORT                     Default SSE port (default: 3001)
  MCP_SSE_HOST                     Default SSE host (default: 127.0.0.1 for local only, use 0.0.0.0 for all interfaces)
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
  # Default stdio mode (for MCP clients, requires .env file or --mcp parameter)
  mcp-abap-adt

  # HTTP mode (for web interfaces)
  mcp-abap-adt --transport=http

  # HTTP server on custom port, localhost only (default)
  mcp-abap-adt --transport=http --http-port=8080

  # HTTP server accepting connections from all interfaces (less secure)
  mcp-abap-adt --transport=http --http-host=0.0.0.0 --http-port=8080

  # Use YAML configuration file
  mcp-abap-adt --config=config.yaml

  # Use stdio mode with --mcp parameter (uses auth-broker, skips .env file)
  mcp-abap-adt --mcp=TRIAL

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
  Installation:    docs/installation/INSTALLATION.md
  Configuration:   docs/user-guide/CLIENT_CONFIGURATION.md
  Available Tools: docs/user-guide/AVAILABLE_TOOLS.md

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

  For more details, see: docs/user-guide/CLIENT_CONFIGURATION.md#destination-based-authentication

`;
  console.log(help);
  process.exit(0);
}

export type TransportConfig =
  | { type: "stdio" }
  | {
    type: "streamable-http";
    host: string;
    port: number;
    enableJsonResponse: boolean;
    allowedOrigins?: string[];
    allowedHosts?: string[];
    enableDnsRebindingProtection: boolean;
  }
  | {
    type: "sse";
    host: string;
    port: number;
    allowedOrigins?: string[];
    allowedHosts?: string[];
    enableDnsRebindingProtection: boolean;
  };

export function getArgValue(name: string): string | undefined {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith(`${name}=`)) {
      return arg.slice(name.length + 1);
    }
    if (arg === name && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  return undefined;
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

export function parseBoolean(value?: string): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function resolvePortOption(argName: string, envName: string, defaultValue: number): number {
  const rawValue = getArgValue(argName) ?? process.env[envName];
  if (!rawValue) {
    return defaultValue;
  }

  const port = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port value for ${argName}: ${rawValue}`);
  }

  return port;
}

export function resolveBooleanOption(argName: string, envName: string, defaultValue: boolean): boolean {
  const argValue = getArgValue(argName);
  if (argValue !== undefined) {
    return parseBoolean(argValue);
  }
  if (hasFlag(argName)) {
    return true;
  }
  const envValue = process.env[envName];
  if (envValue !== undefined) {
    return parseBoolean(envValue);
  }
  return defaultValue;
}

export function resolveListOption(argName: string, envName: string): string[] | undefined {
  const rawValue = getArgValue(argName) ?? process.env[envName];
  if (!rawValue) {
    return undefined;
  }
  const items = rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return items.length > 0 ? items : undefined;
}

export function parseTransportConfig(transportType: string): TransportConfig {
  // Use the transport type provided as parameter
  const normalized = transportType;

  if (
    normalized &&
    normalized !== "stdio" &&
    normalized !== "http" &&
    normalized !== "streamable-http" &&
    normalized !== "server" &&
    normalized !== "sse"
  ) {
    throw new Error(`Unsupported transport: ${normalized}`);
  }

  const sseRequested =
    normalized === "sse" ||
    hasFlag("--sse");

  if (sseRequested) {
    const port = resolvePortOption("--sse-port", "MCP_SSE_PORT", 3001);
    // Default to localhost (127.0.0.1) for security - only accepts local connections
    // Use 0.0.0.0 to accept connections from all interfaces (less secure)
    const host = getArgValue("--sse-host") ?? process.env.MCP_SSE_HOST ?? "127.0.0.1";
    const allowedOrigins = resolveListOption("--sse-allowed-origins", "MCP_SSE_ALLOWED_ORIGINS");
    const allowedHosts = resolveListOption("--sse-allowed-hosts", "MCP_SSE_ALLOWED_HOSTS");
    const enableDnsRebindingProtection = resolveBooleanOption(
      "--sse-enable-dns-protection",
      "MCP_SSE_ENABLE_DNS_PROTECTION",
      false
    );

    return {
      type: "sse",
      host,
      port,
      allowedOrigins,
      allowedHosts,
      enableDnsRebindingProtection,
    };
  }

  const httpRequested =
    normalized === "http" ||
    normalized === "streamable-http" ||
    normalized === "server" ||
    hasFlag("--http") ||
    // Note: Default is stdio (set in runtimeConfig), so this only applies if explicitly requested
    (!sseRequested && normalized !== "stdio");

  if (httpRequested) {
    const port = resolvePortOption("--http-port", "MCP_HTTP_PORT", 3000);
    // Default to localhost (127.0.0.1) for security - only accepts local connections
    // Use 0.0.0.0 to accept connections from all interfaces (less secure)
    const host = getArgValue("--http-host") ?? process.env.MCP_HTTP_HOST ?? "127.0.0.1";
    const enableJsonResponse = resolveBooleanOption(
      "--http-json-response",
      "MCP_HTTP_ENABLE_JSON_RESPONSE",
      false
    );
    const allowedOrigins = resolveListOption("--http-allowed-origins", "MCP_HTTP_ALLOWED_ORIGINS");
    const allowedHosts = resolveListOption("--http-allowed-hosts", "MCP_HTTP_ALLOWED_HOSTS");
    const enableDnsRebindingProtection = resolveBooleanOption(
      "--http-enable-dns-protection",
      "MCP_HTTP_ENABLE_DNS_PROTECTION",
      false
    );

    return {
      type: "streamable-http",
      host,
      port,
      enableJsonResponse,
      allowedOrigins,
      allowedHosts,
      enableDnsRebindingProtection,
    };
  }

  return { type: "stdio" };
}

let sapConfigOverride: SapConfig | undefined;

export interface ServerOptions {
  sapConfig?: SapConfig;
  connection?: AbapConnection;
  transportConfig?: TransportConfig;
  allowProcessExit?: boolean;
  registerSignalHandlers?: boolean;
}

export function setSapConfigOverride(config?: SapConfig) {
  sapConfigOverride = config;
  setConfigOverride(config);
}

export function setAbapConnectionOverride(connection?: AbapConnection) {
  setConnectionOverride(connection);
}

/**
 * Retrieves SAP configuration from environment variables.
 * Reads configuration from process.env (caller is responsible for loading .env file if needed).
 *
 * @returns {SapConfig} The SAP configuration object.
 * @throws {Error} If any required environment variable is missing.
 */
// Helper function for Windows-compatible logging
// Only logs when DEBUG_CONNECTORS, DEBUG_TESTS, or DEBUG_ADT_TESTS is enabled
function debugLog(message: string): void {
  const debugEnabled = process.env.DEBUG_CONNECTORS === 'true' ||
                       process.env.DEBUG_TESTS === 'true' ||
                       process.env.DEBUG_ADT_TESTS === 'true';

  if (!debugEnabled) {
    return; // Suppress debug logs when not in debug mode
  }

  // Try stderr first
  try {
    process.stderr.write(message);
  } catch (e) {
    // Fallback to console.error for Windows
    console.error(message.trim());
  }
  // Also try to write to a debug file on Windows
  if (process.platform === 'win32') {
    try {
      const fs = require('fs');
      const path = require('path');
      const debugFile = path.join(process.cwd(), 'mcp-debug.log');
      fs.appendFileSync(debugFile, `${new Date().toISOString()} ${message}`, 'utf8');
    } catch (e) {
      // Ignore file write errors
    }
  }
}

// Re-export header constants from interfaces package
export * from "@mcp-abap-adt/interfaces";

export function getConfig(): SapConfig {
  debugLog(`[MCP-CONFIG] getConfig() called\n`);

  if (sapConfigOverride) {
    debugLog(`[MCP-CONFIG] Using override config\n`);
    return sapConfigOverride;
  }

  // Read from process.env (already loaded and cleaned by launcher or at startup)
  // No need to reload .env here - it's already in process.env
  let url = process.env.SAP_URL;
  let client = process.env.SAP_CLIENT;

  debugLog(`[MCP-CONFIG] Raw process.env.SAP_URL: "${url}" (type: ${typeof url}, length: ${url?.length || 0})\n`);

  // URLs from .env files are expected to be clean - just trim
  if (url) {
    url = url.trim();
  } else {
    // Log if URL is missing
    debugLog(`[MCP-CONFIG] ✗ SAP_URL is missing from process.env\n`);
    debugLog(`[MCP-CONFIG] Available env vars: ${Object.keys(process.env).filter(k => k.startsWith('SAP_')).join(', ')}\n`);
  }

  if (client) {
    client = client.trim();
  }

  // Auto-detect auth type: if JWT token is present, use JWT; otherwise check SAP_AUTH_TYPE or default to basic
  let authType: SapConfig["authType"] = 'basic';
  if (process.env.SAP_JWT_TOKEN) {
    authType = 'jwt';
  } else if (process.env.SAP_AUTH_TYPE) {
    const rawAuthType = process.env.SAP_AUTH_TYPE.trim();
    authType = rawAuthType === 'xsuaa' ? 'jwt' : (rawAuthType as SapConfig["authType"]);
  }

  if (!url) {
    throw new Error(`Missing SAP_URL in environment variables. Please check your .env file.`);
  }

  // Final validation - URL should be clean now
  if (!/^https?:\/\//.test(url)) {
    // Log URL in hex for debugging
    const urlHex = Buffer.from(url, 'utf8').toString('hex');
    throw new Error(`Invalid SAP_URL format: "${url}" (hex: ${urlHex.substring(0, 100)}...). Expected format: https://your-system.sap.com`);
  }

  // Additional validation: try to create URL object to catch any remaining issues
  try {
    const testUrl = new URL(url);
    // If URL object creation succeeds, use the normalized URL
    url = testUrl.href.replace(/\/$/, ''); // Remove trailing slash if present
  } catch (urlError) {
    const urlHex = Buffer.from(url, 'utf8').toString('hex');
    throw new Error(`Invalid SAP_URL: "${url}" (hex: ${urlHex.substring(0, 100)}...). Error: ${urlError instanceof Error ? urlError.message : urlError}`);
  }

  // Log URL for debugging
  debugLog(`[MCP-CONFIG] Final SAP_URL: "${url}" (length: ${url.length})\n`);

  const config: SapConfig = {
    url, // Already cleaned and validated above
    authType,
  };

  if (client) {
    config.client = client;
  }

  if (authType === 'jwt') {
    const jwtToken = process.env.SAP_JWT_TOKEN;
    if (!jwtToken) {
      throw new Error('Missing SAP_JWT_TOKEN for JWT authentication');
    }
    // Values from .env are expected to be clean
    config.jwtToken = jwtToken.trim();
    const refreshToken = process.env.SAP_REFRESH_TOKEN;
    if (refreshToken) {
      config.refreshToken = refreshToken.trim();
    }
    const uaaUrl = process.env.SAP_UAA_URL || process.env.UAA_URL;
    const uaaClientId = process.env.SAP_UAA_CLIENT_ID || process.env.UAA_CLIENT_ID;
    const uaaClientSecret = process.env.SAP_UAA_CLIENT_SECRET || process.env.UAA_CLIENT_SECRET;
    if (uaaUrl) config.uaaUrl = uaaUrl.trim();
    if (uaaClientId) config.uaaClientId = uaaClientId.trim();
    if (uaaClientSecret) config.uaaClientSecret = uaaClientSecret.trim();
  } else {
    const username = process.env.SAP_USERNAME;
    const password = process.env.SAP_PASSWORD;
    if (!username || !password) {
      throw new Error('Missing SAP_USERNAME or SAP_PASSWORD for basic authentication');
    }
    config.username = username.trim();
    config.password = password.trim();
  }

  return config;
}
