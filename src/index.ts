#!/usr/bin/env node
// Simple stdio mode detection (like reference implementation)
// No output suppression needed - dotenv removed, manual .env parsing used

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { McpHandlers } from "./lib/servers/mcp_handlers";
import path from "path";
import * as os from "os";
// dotenv removed - using manual .env parsing for all modes to avoid stdout pollution
import { createServer, Server as HttpServer, IncomingHttpHeaders } from "http";
import { randomUUID } from "crypto";
import { AuthBroker } from "@mcp-abap-adt/auth-broker";
import { validateAuthHeaders, AuthMethodPriority } from "@mcp-abap-adt/header-validator";
import {
  HEADER_MCP_DESTINATION,
  HEADER_SAP_DESTINATION_SERVICE,
  HEADER_SAP_URL,
  HEADER_SAP_AUTH_TYPE,
  HEADER_SAP_JWT_TOKEN,
  HEADER_SAP_LOGIN,
  HEADER_SAP_PASSWORD,
  HEADER_SAP_REFRESH_TOKEN,
  HEADER_SAP_UAA_CLIENT_SECRET,
  HEADER_AUTHORIZATION,
} from "@mcp-abap-adt/interfaces";
import { AuthBrokerFactory } from "./lib/authBrokerFactory";
import { getPlatformPaths } from "./lib/stores/platformPaths";
import { defaultLogger } from "@mcp-abap-adt/logger";
import {
  buildRuntimeConfig,
} from "./lib/runtimeConfig";
import {
  parseConfigArg,
  loadYamlConfig,
  generateConfigTemplateIfNeeded,
  applyYamlConfigToArgs,
} from "./lib/yamlConfig";
import { ILogger } from "@mcp-abap-adt/interfaces";

// Import handler functions
// Import handler functions
// New low-level handlers imports

// Import shared utility functions and types
import {
  sessionContext,
  removeConnectionForSession,
  setConnectionOverride,
} from "./lib/utils";
import { getConfig, setSapConfigOverride } from "./lib/config.js";
import { SapConfig, AbapConnection, createAbapConnection } from "@mcp-abap-adt/connection";
import { loggerAdapter } from "./lib/loggerAdapter";

// Import logger
import { logger } from "./lib/logger";
// import { defaultLogger as logger } from "@mcp-abap-adt/logger";

// Import tool registry

// Import TOOL_DEFINITION from handlers
// New low-level handlers TOOL_DEFINITION imports

// --- ENV FILE LOADING LOGIC ---
import fs from "fs";
import { HandlerContext } from "./lib/handlers/interfaces";

/**
 * Display help message
 */
function showHelp(): void {
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

// Check for version/help flags
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  const packageJsonPath = path.join(__dirname, "..", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  console.log(packageJson.version);
  process.exit(0);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  showHelp();
}

// Load YAML config if --config parameter is provided
// YAML config values are applied to process.argv (command-line args override YAML)
const configPath = parseConfigArg();
if (configPath) {
  try {
    // Generate template if file doesn't exist
    const templateGenerated = generateConfigTemplateIfNeeded(configPath);

    // If template was just generated, exit successfully
    // User needs to edit the file before running the server
    if (templateGenerated) {
      if (process.platform === 'win32') {
        setTimeout(() => process.exit(0), 100);
      } else {
        process.exit(0);
      }
    }

    // Load and apply YAML config (only if file exists)
    const yamlConfig = loadYamlConfig(configPath);
    if (yamlConfig) {
      applyYamlConfigToArgs(yamlConfig);
      // Only write to stderr if not in stdio mode (stdio mode requires clean JSON only)
      const isStdioMode = process.env.MCP_TRANSPORT === "stdio" || !process.stdin.isTTY;
      if (!isStdioMode) {
        process.stderr.write(`[MCP-CONFIG] Loaded and validated configuration from: ${configPath}\n`);
      }
    }
  } catch (error) {
    const errorMsg = `Failed to load YAML config: ${error instanceof Error ? error.message : String(error)}`;
    process.stderr.write(`[MCP-CONFIG] ✗ ERROR: ${errorMsg}\n`);
    if (process.platform === 'win32') {
      setTimeout(() => process.exit(1), 100);
    } else {
      process.exit(1);
    }
  }
}

// Runtime config (shared, no side-effects)
const {
  useAuthBroker,
  isTestEnv,
  authBrokerPath,
  defaultMcpDestination,
  unsafe,
  explicitTransportType,
  transportType,
  isHttp,
  isSse,
  isStdio,
  isEnvMandatory,
  envFilePath: initialEnvFilePath,
} = buildRuntimeConfig();

// Skip .env autoload under explicit instructions, auth-broker, mcp default, or test env
const skipEnvAutoload =
  process.env.MCP_SKIP_ENV_LOAD === "true" ||
  process.env.MCP_ENV_LOADED_BY_LAUNCHER === "true" ||
  useAuthBroker ||
  !!defaultMcpDestination ||
  isTestEnv;

let envFilePath = initialEnvFilePath;

// Debug: Always log on Windows to help diagnose issues
if (process.platform === 'win32' && !isStdio) {
  process.stderr.write(`[MCP-ENV] parseEnvArg() returned: ${envFilePath || '(undefined)'}\n`);
  process.stderr.write(`[MCP-ENV] MCP_ENV_PATH: ${process.env.MCP_ENV_PATH || '(not set)'}\n`);
  process.stderr.write(`[MCP-ENV] Final envFilePath: ${envFilePath || '(will search for .env)'}\n`);
}

if (!skipEnvAutoload) {
  if (!envFilePath) {
    // Default behavior: search in current working directory (where user runs the command)
    // If .env exists, use it; otherwise will use auth-broker
    const cwdEnvPath = path.resolve(process.cwd(), ".env");

    if (fs.existsSync(cwdEnvPath)) {
      envFilePath = cwdEnvPath;
      // Only write to stderr if not in stdio mode (stdio mode requires clean JSON only)
      if (!isStdio) {
        process.stderr.write(`[MCP-ENV] Found .env file: ${envFilePath}\n`);
      }
    }
  } else {
    // Only write to stderr if not in stdio mode
    if (!isStdio) {
      process.stderr.write(`[MCP-ENV] Using .env from argument/env: ${envFilePath}\n`);
      // On Windows, also log the resolved path for debugging
      if (process.platform === 'win32') {
        const resolvedPath = path.isAbsolute(envFilePath)
          ? envFilePath
          : path.resolve(process.cwd(), envFilePath);
        process.stderr.write(`[MCP-ENV] Will resolve to: ${resolvedPath}\n`);
      }
    }
  }

  if (envFilePath) {
    // Normalize path separators for Windows compatibility
    // On Windows, backslashes in paths need special handling
    // path.resolve() and path.normalize() should handle this, but let's be explicit

    // First, normalize all backslashes to forward slashes for consistent processing
    // Then use path methods which handle platform-specific separators correctly
    const normalizedPath = envFilePath.replace(/\\/g, '/');

    if (!path.isAbsolute(normalizedPath)) {
      // For relative paths, use path.resolve which handles .\ and ./ correctly on all platforms
      // path.resolve automatically handles both .\mdd.env and ./mdd.env formats
      envFilePath = path.resolve(process.cwd(), normalizedPath);
      // Only write to stderr if not in stdio mode
      if (!isStdio) {
        process.stderr.write(`[MCP-ENV] Resolved relative path to: ${envFilePath}\n`);
      }
    } else {
      // For absolute paths, normalize using path.normalize
      envFilePath = path.normalize(envFilePath);
    }

    // Verify file exists before attempting to load
    if (!fs.existsSync(envFilePath)) {
      const errorMsg = `[MCP-ENV] ✗ ERROR: .env file not found at: ${envFilePath}\n` +
        `[MCP-ENV]   Current working directory: ${process.cwd()}\n` +
        `[MCP-ENV]   Please check the path and try again.\n`;
      process.stderr.write(errorMsg);
      if (process.platform === 'win32') {
        setTimeout(() => process.exit(1), 100);
      } else {
        process.exit(1);
      }
    }

    if (fs.existsSync(envFilePath)) {
      // For stdio mode, load .env manually to avoid any output from dotenv library
      if (isStdio) {
        // Manual .env parsing for stdio mode (no library output)
        try {
          const envContent = fs.readFileSync(envFilePath, "utf8");
          const lines = envContent.split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trim();
            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith("#")) {
              continue;
            }
            // Parse KEY=VALUE format
            const eqIndex = trimmed.indexOf("=");
            if (eqIndex === -1) {
              continue;
            }
            const key = trimmed.substring(0, eqIndex).trim();
            let value = trimmed.substring(eqIndex + 1);

            // Remove inline comments (everything after #)
            // This handles cases like: KEY=value # comment or KEY=value#comment
            // Find first # and remove everything after it (including the #)
            const commentIndex = value.indexOf('#');
            if (commentIndex !== -1) {
              // Remove everything from # onwards, then trim trailing whitespace
              const beforeComment = value.substring(0, commentIndex);
              value = beforeComment.trim();
            } else {
              value = value.trim();
            }

            // Parse value: remove quotes and trim
            let unquotedValue = value.trim();
            unquotedValue = unquotedValue.replace(/^["']+|["']+$/g, '').trim();

            // URLs from .env files are expected to be clean - just use as-is
            if (key === 'SAP_URL') {
              // No special processing needed

              // Debug logging for Windows
              if (process.platform === 'win32' && !isStdio) {
                process.stderr.write(`[MCP-ENV] Parsed SAP_URL: "${unquotedValue}" (length: ${unquotedValue.length})\n`);
              }
            }
            // Only set if not already in process.env (don't override launcher's cleaned values)
            if (key && !process.env[key]) {
              process.env[key] = unquotedValue;
            }
          }
        } catch (error) {
          // Silent fail for stdio mode - just exit
          process.exit(1);
        }
      } else {
        // For non-stdio modes, use manual parsing (dotenv removed to avoid stdout pollution)
        try {
          const envContent = fs.readFileSync(envFilePath, "utf8");
          const lines = envContent.split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) {
              continue;
            }
            const eqIndex = trimmed.indexOf("=");
            if (eqIndex === -1) {
              continue;
            }
            const key = trimmed.substring(0, eqIndex).trim();
            let value = trimmed.substring(eqIndex + 1);

            // Remove inline comments (everything after #)
            // This handles cases like: KEY=value # comment or KEY=value#comment
            // Find first # and remove everything after it (including the #)
            const commentIndex = value.indexOf('#');
            if (commentIndex !== -1) {
              // Remove everything from # onwards, then trim trailing whitespace
              const beforeComment = value.substring(0, commentIndex);
              value = beforeComment.trim();
            } else {
              value = value.trim();
            }

            // Parse value: remove quotes and trim
            let unquotedValue = value.trim();
            unquotedValue = unquotedValue.replace(/^["']+|["']+$/g, '').trim();

            // URLs from .env files are expected to be clean - just use as-is
            if (key === 'SAP_URL') {
              // No special processing needed

              // Debug logging for Windows
              if (process.platform === 'win32' && !isStdio) {
                process.stderr.write(`[MCP-ENV] Parsed SAP_URL: "${unquotedValue}" (length: ${unquotedValue.length})\n`);
              }
            }
            // Only set if not already in process.env (don't override launcher's cleaned values)
            if (key && !process.env[key]) {
              process.env[key] = unquotedValue;
            }
          }
          process.stderr.write(`[MCP-ENV] ✓ Successfully loaded: ${envFilePath}\n`);
          // Debug: log SAP_URL if loaded (for troubleshooting on Windows)
          if (process.env.SAP_URL) {
            const urlHex = Buffer.from(process.env.SAP_URL, 'utf8').toString('hex');
            process.stderr.write(`[MCP-ENV] SAP_URL loaded: "${process.env.SAP_URL}" (length: ${process.env.SAP_URL.length})\n`);
            if (process.platform === 'win32') {
              process.stderr.write(`[MCP-ENV] SAP_URL (hex): ${urlHex.substring(0, 60)}...\n`);
              // Check for comments
              if (process.env.SAP_URL.includes('#')) {
                process.stderr.write(`[MCP-ENV] ⚠ WARNING: SAP_URL contains # character (comment not removed?)\n`);
              }
            }
          } else {
            process.stderr.write(`[MCP-ENV] ⚠ WARNING: SAP_URL not found in .env file\n`);
          }
        } catch (error) {
          process.stderr.write(`[MCP-ENV] ✗ Failed to load: ${envFilePath}\n`);
          if (error instanceof Error) {
            process.stderr.write(`[MCP-ENV] Error: ${error.message}\n`);
          }
        }
      }
    } else {
      // .env file specified but not found
      if (isEnvMandatory) {
        // Always write error to stderr (stderr is safe even in stdio mode, unlike stdout)
        logger?.error(".env file not found", { path: envFilePath });
        process.stderr.write(`[MCP-ENV] ✗ ERROR: .env file not found at: ${envFilePath}\n`);
        process.stderr.write(`[MCP-ENV]   Current working directory: ${process.cwd()}\n`);
        process.stderr.write(`[MCP-ENV]   Transport mode '${transportType}' requires .env file.\n`);
        process.stderr.write(`[MCP-ENV]   Use --env=/path/to/.env to specify custom location\n`);
        // On Windows, add a small delay before exit to allow error message to be visible
        if (process.platform === 'win32') {
          setTimeout(() => process.exit(1), 100);
        } else {
          process.exit(1);
        }
      } else {
        // Always write error to stderr (stderr is safe even in stdio mode)
        process.stderr.write(`[MCP-ENV] ✗ ERROR: .env file not found at: ${envFilePath}\n`);
        process.stderr.write(`[MCP-ENV]   Transport mode '${transportType}' was explicitly specified but .env file is missing.\n`);
        process.stderr.write(`[MCP-ENV]   Use --env=/path/to/.env to specify custom location\n`);
        // On Windows, add a small delay before exit to allow error message to be visible
        if (process.platform === 'win32') {
          setTimeout(() => process.exit(1), 100);
        } else {
          process.exit(1);
        }
      }
    }
  } else {
    // No .env file found and none specified
    if (isEnvMandatory) {
      // Transport explicitly set to stdio/sse but no .env found
      const cwdEnvPath = path.resolve(process.cwd(), ".env");
      // Always write error to stderr (stderr is safe even in stdio mode)
      logger?.error(".env file not found", { path: cwdEnvPath });
      process.stderr.write(`[MCP-ENV] ✗ ERROR: .env file not found in current directory: ${process.cwd()}\n`);
      process.stderr.write(`[MCP-ENV]   Transport mode '${transportType}' requires .env file.\n`);
      process.stderr.write(`[MCP-ENV]   Use --env=/path/to/.env to specify custom location\n`);
      // On Windows, add a small delay before exit to allow error message to be visible
      if (process.platform === 'win32') {
        setTimeout(() => process.exit(1), 100);
      } else {
        process.exit(1);
      }
    } else {
      // No .env found, but transport is stdio (default) - this is OK for HTTP/SSE, but stdio requires .env or --mcp
      if (explicitTransportType === null) {
        // Transport not specified, using default (stdio)
        // For stdio mode, don't write to stderr
        if (!isStdio) {
          process.stderr.write(`[MCP-ENV] NOTE: No .env file found in current directory: ${process.cwd()}\n`);
          process.stderr.write(`[MCP-ENV]   Starting in HTTP mode (no .env file required)\n`);
        }
      } else {
        // Transport explicitly set to HTTP - this is OK
        // For stdio mode, don't write to stderr
        if (!isStdio) {
          process.stderr.write(`[MCP-ENV] NOTE: No .env file found, continuing in ${transportType} mode\n`);
        }
      }
    }
  }
} else if (envFilePath) {
  if (!path.isAbsolute(envFilePath)) {
    envFilePath = path.resolve(process.cwd(), envFilePath);
  }
  // For stdio mode, don't write to stderr
  if (!isStdio) {
    process.stderr.write(`[MCP-ENV] Environment autoload skipped; using provided path reference: ${envFilePath}\n`);
  }
} else {
  // For stdio mode, don't write to stderr
  if (!isStdio) {
    process.stderr.write(`[MCP-ENV] Environment autoload skipped (MCP_SKIP_ENV_LOAD=true).\n`);
  }
}
// --- END ENV FILE LOADING LOGIC ---

// Debug: Log loaded SAP_URL and SAP_CLIENT using the MCP-compatible logger
// Skip logging in stdio mode (MCP protocol requires clean JSON only)
if (!isStdio) {
  const envLogPath = envFilePath ?? "(skipped)";
  logger?.info("SAP configuration loaded", {
    type: "CONFIG_INFO",
    SAP_URL: process.env.SAP_URL,
    SAP_CLIENT: process.env.SAP_CLIENT || "(not set)",
    SAP_AUTH_TYPE: process.env.SAP_AUTH_TYPE || "(not set)",
    SAP_JWT_TOKEN: process.env.SAP_JWT_TOKEN ? "[set]" : "(not set)",
    ENV_PATH: envLogPath,
    CWD: process.cwd(),
    DIRNAME: __dirname,
    TRANSPORT: transportType
  });
}

type TransportConfig =
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

function getArgValue(name: string): string | undefined {
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

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parseBoolean(value?: string): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function resolvePortOption(argName: string, envName: string, defaultValue: number): number {
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

function resolveBooleanOption(argName: string, envName: string, defaultValue: boolean): boolean {
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

function resolveListOption(argName: string, envName: string): string[] | undefined {
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

function parseTransportConfig(): TransportConfig {
  // Use the transport type we already determined (handles explicit args, env vars, and defaults)
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

export interface ServerOptions {
  sapConfig?: SapConfig;
  connection?: AbapConnection;
  transportConfig?: TransportConfig;
  allowProcessExit?: boolean;
  registerSignalHandlers?: boolean;
}

// Re-export setSapConfigOverride from config module
export { setSapConfigOverride };

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

// Re-export getConfig from config module
export { getConfig };

/**
 * Server class for interacting with ABAP systems via ADT.
 */
export class mcp_abap_adt_server {
  private readonly allowProcessExit: boolean;
  private readonly registerSignalHandlers: boolean;
  private mcpServer: McpServer; // MCP server for all transports
  private sapConfig: SapConfig; // SAP configuration
  private readonly hasEnvFile: boolean; // Track if .env file was found at startup
  private transportConfig: TransportConfig;
  private httpServer?: HttpServer;
  private shuttingDown = false;
  private readonly defaultMcpDestination?: string; // Default MCP destination from --mcp parameter
  private defaultDestination?: string; // Default destination (from --mcp or .env, used when client doesn't specify)
  private mcpHandlers: McpHandlers;

  // Client session tracking for StreamableHTTP (like the example)
  private streamableHttpSessions = new Map<string, {
    sessionId: string;
    clientIP: string;
    connectedAt: Date;
    requestCount: number;
    sapConfig?: SapConfig; // Store SAP config per session
    destination?: string; // Store destination for AuthBroker-based token refresh
  }>();
  // Map sessionId -> client key (streamable HTTP) for quick lookups
  private streamableSessionIndex = new Map<string, string>();

  // SSE session tracking (McpServer + SSEServerTransport per session)
  private sseSessions = new Map<string, {
    server: McpServer;
    transport: SSEServerTransport;
  }>();

  // AuthBroker factory for creating and managing AuthBroker instances
  private authBrokerFactory: AuthBrokerFactory;

  // Path to .env file (used to create SessionStore when --mcp is not specified)
  private readonly envFilePath?: string;

  /**
   * Initialize default broker on server startup (for stdio/SSE transports)
   * Creates broker with default destination from --mcp parameter or .env file
   */
  private async initializeDefaultBroker(): Promise<void> {
    // Determine default destination
    if (this.defaultMcpDestination) {
      // Scenario A: Destination specified at startup (--mcp parameter)
      this.defaultDestination = this.defaultMcpDestination;

      // Create broker with serviceKeyStore + sessionStore
      const authBroker = await this.getOrCreateAuthBroker(this.defaultMcpDestination, 'global');
      if (authBroker) {
        logger?.info("Default broker initialized with destination from --mcp parameter", {
          type: "DEFAULT_BROKER_INITIALIZED",
          destination: this.defaultMcpDestination,
          transport: this.transportConfig.type,
        });
      }
    } else if (this.hasEnvFile) {
      // Scenario B: No destination specified, but .env file exists
      this.defaultDestination = 'default'; // Use 'default' as destination name for .env case

      // Create broker with only sessionStore (without serviceKeyStore)
      // Note: getOrCreateAuthBroker will create broker, but we need to ensure it works with .env
      // For .env case, sessionStore should load from .env file
      const authBroker = await this.getOrCreateAuthBroker('default', 'global');
      if (authBroker) {
        logger?.info("Default broker initialized with .env file", {
          type: "DEFAULT_BROKER_INITIALIZED_ENV",
          destination: 'default',
          transport: this.transportConfig.type,
        });
      }
    } else {
      // Scenario C: Neither destination nor .env
      // For stdio: error will be thrown in run() method
      // For SSE/HTTP: no default broker, wait for headers
      logger?.debug("No default destination available (no --mcp parameter and no .env file)", {
        type: "NO_DEFAULT_DESTINATION",
        transport: this.transportConfig.type,
      });
    }
  }

  /**
   * Get or create AuthBroker for a specific destination (lazy initialization)
   * If destination is not specified, uses default destination
   */
  private async getOrCreateAuthBroker(destination?: string, clientKey?: string): Promise<AuthBroker | undefined> {
    return this.authBrokerFactory.getOrCreateAuthBroker(destination, clientKey);
  }

  private async applyAuthHeaders(headers?: IncomingHttpHeaders, sessionId?: string, clientKey?: string) {
    // Security: If server is listening on non-local interface (0.0.0.0), don't use default destination
    // Client must provide all connection parameters in headers - server only proxies to ABAP
    const isNonLocalInterface = this.isListeningOnNonLocalInterface();

    if (isNonLocalInterface) {
      // Non-local interface: use only what client provides in headers, no default destination
      if (!headers || Object.keys(headers).length === 0) {
        logger?.info("No headers provided - server listening on non-local interface requires all headers from client", {
          type: "NO_HEADERS_NON_LOCAL_INTERFACE",
          sessionId: sessionId?.substring(0, 8),
          hint: `Server is listening on 0.0.0.0 - client must provide all connection parameters in headers. Server will not use default destination for security.`,
        });
        return;
      }
      // Use headers as-is, no default destination
      logger?.debug("Non-local interface: using only client-provided headers", {
        type: "NON_LOCAL_INTERFACE_HEADERS_ONLY",
        sessionId: sessionId?.substring(0, 8),
      });
    } else {
      // Local interface (127.0.0.1): can use default destination if no headers
      // If no headers but defaultDestination is set, use it
      // Client values have priority (Q10), but if no headers at all, use default
      if (!headers || Object.keys(headers).length === 0) {
        if (this.defaultDestination) {
          // Use default destination to get connection config from broker
          const authBroker = await this.getOrCreateAuthBroker(this.defaultDestination, clientKey || sessionId);
          if (authBroker) {
            try {
              const connConfig = await authBroker.getConnectionConfig(this.defaultDestination);
              if (connConfig?.serviceUrl) {
                // Check authType from connection config BEFORE calling getToken()
                const isBasicAuth = connConfig.authType === 'basic' || (connConfig.username && connConfig.password);

                if (isBasicAuth) {
                  // Basic auth for on-premise
                  if (connConfig.username && connConfig.password) {
                    this.processBasicAuthConfigUpdate(
                      connConfig.serviceUrl,
                      connConfig.username,
                      connConfig.password,
                      sessionId
                    );
                    logger?.info("No headers provided, using default destination with basic auth", {
                      type: "NO_HEADERS_DEFAULT_DESTINATION_BASIC_AUTH",
                      destination: this.defaultDestination,
                      sessionId: sessionId?.substring(0, 8),
                    });
                  }
                } else {
                  // JWT auth for cloud
                  const jwtToken = await authBroker.getToken(this.defaultDestination);
                  if (jwtToken) {
                    // Create headers object with default destination
                    headers = {
                      [HEADER_MCP_DESTINATION]: this.defaultDestination,
                      [HEADER_SAP_URL]: connConfig.serviceUrl,
                      [HEADER_SAP_JWT_TOKEN]: jwtToken,
                    };
                    logger?.info("No headers provided, using default destination", {
                      type: "NO_HEADERS_DEFAULT_DESTINATION_USED",
                      destination: this.defaultDestination,
                      sessionId: sessionId?.substring(0, 8),
                    });
                  }
                }
              }
            } catch (error) {
              logger?.warn("Failed to get connection config from default destination", {
                type: "DEFAULT_DESTINATION_CONFIG_FAILED",
                destination: this.defaultDestination,
                sessionId: sessionId?.substring(0, 8),
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }

        // If still no headers after trying default destination, log and return
        if (!headers || Object.keys(headers).length === 0) {
          logger?.info("No headers provided in request and no default destination available", {
            type: "NO_HEADERS_PROVIDED",
            sessionId: sessionId?.substring(0, 8),
            hint: `Provide authentication headers (${HEADER_SAP_DESTINATION_SERVICE}, ${HEADER_SAP_URL}, ${HEADER_SAP_AUTH_TYPE}, etc.) or use --mcp parameter or .env file`,
          });
          return;
        }
      }

      // Apply default destination if not provided in headers (client values have priority)
      // Only for local interface
      if (this.defaultDestination && !headers[HEADER_MCP_DESTINATION] && !headers['X-MCP-Destination']) {
        headers[HEADER_MCP_DESTINATION] = this.defaultDestination;
        logger?.info("Using default destination (client didn't specify)", {
          type: "DEFAULT_DESTINATION_APPLIED",
          destination: this.defaultDestination,
          sessionId: sessionId?.substring(0, 8),
        });
      }
    }

    // Ensure headers is set for processing below
    if (!headers) {
      headers = {};
    }
    const headersWithDefault = { ...headers };

    // Log which auth headers are present (for debugging)
    // Check headers in both cases (Node.js normalizes to lowercase, but check both for safety)
    const authHeaders = {
      [HEADER_SAP_DESTINATION_SERVICE]: headersWithDefault[HEADER_SAP_DESTINATION_SERVICE] || headersWithDefault['X-SAP-Destination'],
      [HEADER_MCP_DESTINATION]: headersWithDefault[HEADER_MCP_DESTINATION] || headersWithDefault['X-MCP-Destination'],
      [HEADER_SAP_URL]: (headersWithDefault[HEADER_SAP_URL] || headersWithDefault['X-SAP-URL']) ? '[present]' : undefined,
      [HEADER_SAP_AUTH_TYPE]: headersWithDefault[HEADER_SAP_AUTH_TYPE] || headersWithDefault['X-SAP-Auth-Type'],
      [HEADER_SAP_JWT_TOKEN]: (headersWithDefault[HEADER_SAP_JWT_TOKEN] || headersWithDefault['X-SAP-JWT-Token']) ? '[present]' : undefined,
      [HEADER_SAP_LOGIN]: (headersWithDefault[HEADER_SAP_LOGIN] || headersWithDefault['X-SAP-Login']) ? '[present]' : undefined,
    };
    logger?.info("Processing authentication headers", {
      type: "AUTH_HEADERS_PROCESSING",
      headers: authHeaders,
      platform: process.platform,
      sessionId: sessionId?.substring(0, 8),
      allHeaderKeys: Object.keys(headersWithDefault).filter(k => {
        const lowerKey = k.toLowerCase();
        return lowerKey.startsWith('x-sap') || lowerKey.startsWith('x-mcp');
      }),
    });

    // Use header validator to validate and prioritize authentication methods
    const validationResult = validateAuthHeaders(headersWithDefault);

    // Log warnings if any
    if (validationResult.warnings.length > 0) {
      logger?.debug("Header validation warnings", {
        type: "HEADER_VALIDATION_WARNINGS",
        warnings: validationResult.warnings,
        sessionId: sessionId?.substring(0, 8),
      });
    }

    // If validation failed, log info (not error) and return
    // This is not an error - user may be using .env file or base config
    if (!validationResult.isValid || !validationResult.config) {
      if (validationResult.errors.length > 0) {
        logger?.debug("Header validation failed - will use .env file or base config", {
          type: "HEADER_VALIDATION_FAILED",
          errors: validationResult.errors,
          sessionId: sessionId?.substring(0, 8),
          hint: "No valid headers found. Will use .env file or base config if available.",
        });
      } else {
        logger?.debug("No valid authentication headers found - will use .env file or base config", {
          type: "NO_VALID_AUTH_HEADERS",
          sessionId: sessionId?.substring(0, 8),
          hint: "No headers provided. Will use .env file or base config if available.",
        });
      }
      return;
    }

    const config = validationResult.config;

    // Process based on priority (highest to lowest)
    switch (config.priority) {
      case AuthMethodPriority.SAP_DESTINATION: {
        // Priority 4: x-sap-destination (uses AuthBroker, URL from destination)
        if (!config.destination) {
          logger?.warn("SAP destination auth requires destination name", {
            type: "SAP_DESTINATION_AUTH_MISSING",
            destination: config.destination,
            sessionId: sessionId?.substring(0, 8),
          });
          return;
        }

        // Get or create AuthBroker for this destination (lazy initialization)
        const authBroker = await this.getOrCreateAuthBroker(config.destination, clientKey || sessionId);
        if (!authBroker) {
          const errorMessage = `Failed to initialize AuthBroker for destination "${config.destination}". Auth-broker is only available for HTTP/streamable-http transport.`;
          logger?.error(errorMessage, {
            type: "AUTH_BROKER_NOT_INITIALIZED",
            destination: config.destination,
            sessionId: sessionId?.substring(0, 8),
            transport: this.transportConfig.type,
          });
          return;
        }

        try {
          // Get connection config from AuthBroker (loads from .env or service key)
          // Note: destination name must exactly match service key filename (case-sensitive)
          // Example: if file is "sk.json", destination must be "sk" (not "SK")
          const connConfig = await authBroker.getConnectionConfig(config.destination);
          if (!connConfig || !connConfig.serviceUrl) {
            logger?.error("Failed to get SAP URL from destination", {
              type: "SAP_DESTINATION_URL_NOT_FOUND",
              destination: config.destination,
              sessionId: sessionId?.substring(0, 8),
              hint: `Service key file "${config.destination}.json" not found or missing URL. Check file name matches destination exactly (case-sensitive).`,
            });
            return;
          }
          const sapUrl = connConfig.serviceUrl;

          logger?.info("SAP URL retrieved from destination", {
            type: "SAP_URL_RETRIEVED",
            destination: config.destination,
            url: sapUrl,
            sessionId: sessionId?.substring(0, 8),
          });

          // Check authType from connection config BEFORE calling getToken()
          const isBasicAuth = connConfig.authType === 'basic' || (connConfig.username && connConfig.password);

          if (isBasicAuth) {
            // Basic auth for on-premise
            if (connConfig.username && connConfig.password) {
              this.processBasicAuthConfigUpdate(
                sapUrl,
                connConfig.username,
                connConfig.password,
                sessionId
              );
              logger?.info("Updated SAP configuration using SAP destination with basic auth", {
                type: "SAP_CONFIG_UPDATED_SAP_DESTINATION_BASIC_AUTH",
                destination: config.destination,
                url: sapUrl,
                sessionId: sessionId?.substring(0, 8),
              });
            } else {
              logger?.error("Basic auth requires username and password", {
                type: "BASIC_AUTH_MISSING_CREDENTIALS",
                destination: config.destination,
                sessionId: sessionId?.substring(0, 8),
              });
            }
          } else {
            // JWT auth for cloud
            // Get token from AuthBroker
            const jwtToken = await authBroker.getToken(config.destination);

            // Register AuthBroker in global registry for connection to use during token refresh
            const { registerAuthBroker } = require('./lib/utils');
            registerAuthBroker(config.destination, authBroker);

            this.processJwtConfigUpdate(sapUrl, jwtToken, undefined, config.destination, sessionId);

            logger?.info("Updated SAP configuration using SAP destination (AuthBroker)", {
              type: "SAP_CONFIG_UPDATED_SAP_DESTINATION",
              destination: config.destination,
              url: sapUrl,
              sessionId: sessionId?.substring(0, 8),
            });
          }
        } catch (error) {
          logger?.error("Failed to get token from AuthBroker for SAP destination", {
            type: "AUTH_BROKER_ERROR_SAP_DESTINATION",
            destination: config.destination,
            error: error instanceof Error ? error.message : String(error),
            sessionId: sessionId?.substring(0, 8),
          });
        }
        return;
      }

      case AuthMethodPriority.MCP_DESTINATION: {
        // Priority 3: x-mcp-destination (uses AuthBroker, URL from destination or x-sap-url header)
        if (!config.destination) {
          logger?.warn("MCP destination auth requires destination", {
            type: "MCP_DESTINATION_AUTH_MISSING",
            destination: config.destination,
            sessionId: sessionId?.substring(0, 8),
          });
          return;
        }

        // Get or create AuthBroker for this destination (lazy initialization)
        const authBroker = await this.getOrCreateAuthBroker(config.destination, clientKey || sessionId);
        if (!authBroker) {
          logger?.error("Failed to initialize AuthBroker for MCP destination", {
            type: "AUTH_BROKER_NOT_INITIALIZED",
            destination: config.destination,
            sessionId: sessionId?.substring(0, 8),
            transport: this.transportConfig.type,
          });
          return;
        }

        try {
          // Get connection config from AuthBroker (loads from .env or service key)
          // If x-sap-url was provided in headers, it will be ignored (warning already issued by validator)
          // Note: destination name must exactly match service key filename (case-sensitive)
          const connConfig = await authBroker.getConnectionConfig(config.destination);
          if (!connConfig || !connConfig.serviceUrl) {
            logger?.error("Failed to get SAP URL from destination", {
              type: "MCP_DESTINATION_URL_NOT_FOUND",
              destination: config.destination,
              sessionId: sessionId?.substring(0, 8),
              hint: `Service key file "${config.destination}.json" not found or missing URL. Check file name matches destination exactly (case-sensitive).`,
            });
            return;
          }
          const sapUrl = connConfig.serviceUrl;

          logger?.info("SAP URL retrieved from destination", {
            type: "SAP_URL_RETRIEVED",
            destination: config.destination,
            url: sapUrl,
            sessionId: sessionId?.substring(0, 8),
          });

          // Check authType from connection config BEFORE calling getToken()
          const isBasicAuth = connConfig.authType === 'basic' || (connConfig.username && connConfig.password);

          if (isBasicAuth) {
            // Basic auth for on-premise
            if (connConfig.username && connConfig.password) {
              this.processBasicAuthConfigUpdate(
                sapUrl,
                connConfig.username,
                connConfig.password,
                sessionId
              );
              logger?.info("Updated SAP configuration using MCP destination with basic auth", {
                type: "SAP_CONFIG_UPDATED_MCP_DESTINATION_BASIC_AUTH",
                destination: config.destination,
                url: sapUrl,
                sessionId: sessionId?.substring(0, 8),
              });
            } else {
              logger?.error("Basic auth requires username and password", {
                type: "BASIC_AUTH_MISSING_CREDENTIALS",
                destination: config.destination,
                sessionId: sessionId?.substring(0, 8),
              });
            }
          } else {
            // JWT auth for cloud
            // Get token from AuthBroker
            const jwtToken = await authBroker.getToken(config.destination);

            // Register AuthBroker in global registry for connection to use during token refresh
            const { registerAuthBroker } = require('./lib/utils');
            registerAuthBroker(config.destination, authBroker);

            this.processJwtConfigUpdate(sapUrl, jwtToken, undefined, config.destination, sessionId);

            logger?.info("Updated SAP configuration using MCP destination (AuthBroker)", {
              type: "SAP_CONFIG_UPDATED_MCP_DESTINATION",
              destination: config.destination,
              url: sapUrl,
              sessionId: sessionId?.substring(0, 8),
            });
          }
        } catch (error) {
          logger?.error("Failed to get token from AuthBroker for MCP destination", {
            type: "AUTH_BROKER_ERROR_MCP_DESTINATION",
            destination: config.destination,
            error: error instanceof Error ? error.message : String(error),
            sessionId: sessionId?.substring(0, 8),
          });
        }
        return;
      }

      case AuthMethodPriority.DIRECT_JWT: {
        // Priority 2: x-sap-jwt-token (direct JWT token)
        if (!config.sapUrl || !config.jwtToken) {
          logger?.warn("Direct JWT auth requires URL and token", {
            type: "DIRECT_JWT_AUTH_MISSING",
            sapUrl: config.sapUrl,
            hasToken: !!config.jwtToken,
            sessionId: sessionId?.substring(0, 8),
          });
          return;
        }

        this.processJwtConfigUpdate(
          config.sapUrl,
          config.jwtToken,
          config.refreshToken,
          sessionId
        );

        logger?.info("Updated SAP configuration using direct JWT token", {
          type: "SAP_CONFIG_UPDATED_DIRECT_JWT",
          url: config.sapUrl,
          sessionId: sessionId?.substring(0, 8),
        });
        return;
      }

      case AuthMethodPriority.BASIC: {
        // Priority 1: x-sap-login + x-sap-password (basic auth)
        if (!config.sapUrl || !config.username || !config.password) {
          logger?.warn("Basic auth requires URL, username, and password", {
            type: "BASIC_AUTH_MISSING",
            sapUrl: config.sapUrl,
            hasUsername: !!config.username,
            hasPassword: !!config.password,
            sessionId: sessionId?.substring(0, 8),
          });
          return;
        }

        this.processBasicAuthConfigUpdate(config.sapUrl, config.username, config.password, sessionId);

        logger?.info("Updated SAP configuration using basic auth", {
          type: "SAP_CONFIG_UPDATED_BASIC",
          url: config.sapUrl,
          sessionId: sessionId?.substring(0, 8),
        });
        return;
      }

      default: {
        logger?.warn("Unknown authentication method priority", {
          type: "UNKNOWN_AUTH_PRIORITY",
          priority: config.priority,
          sessionId: sessionId?.substring(0, 8),
        });
        return;
      }
    }
  }

  private processJwtConfigUpdate(sapUrl: string, jwtToken: string, refreshToken?: string, destination?: string, sessionId?: string) {
    const sanitizeToken = (token: string) =>
      token.length <= 10 ? token : `${token.substring(0, 6)}…${token.substring(token.length - 4)}`;

    // URL from auth-broker/service key is already clean and correct, no need to clean it
    // Only validate format
    let cleanedUrl = sapUrl.trim();

    // Ensure URL has protocol
    if (!/^https?:\/\//.test(cleanedUrl)) {
      logger?.error("Invalid URL format in processJwtConfigUpdate", {
        type: "INVALID_URL_FORMAT",
        originalUrl: sapUrl,
        cleanedUrl: cleanedUrl,
        sessionId: sessionId?.substring(0, 8),
      });
      throw new Error(`Invalid URL format: "${sapUrl}". Expected format: https://your-system.sap.com`);
    }

    // Normalize URL using URL object
    try {
      const urlObj = new URL(cleanedUrl);
      cleanedUrl = urlObj.href.replace(/\/$/, ''); // Remove trailing slash
    } catch (urlError) {
      logger?.error("Failed to parse URL in processJwtConfigUpdate", {
        type: "URL_PARSE_ERROR",
        url: cleanedUrl,
        error: urlError instanceof Error ? urlError.message : String(urlError),
        sessionId: sessionId?.substring(0, 8),
      });
      throw new Error(`Invalid URL: "${sapUrl}". Error: ${urlError instanceof Error ? urlError.message : urlError}`);
    }

    // Use cleaned URL
    sapUrl = cleanedUrl;

    let baseConfig: SapConfig | undefined = this.sapConfig;
    if (!baseConfig || baseConfig.url === "http://placeholder") {
      try {
        baseConfig = getConfig();
      } catch (error) {
        logger?.warn("Failed to load base SAP config when applying headers", {
          type: "SAP_CONFIG_HEADER_APPLY_FAILED",
          error: error instanceof Error ? error.message : String(error),
        });
        baseConfig = {
          url: sapUrl,
          authType: "jwt",
        };
      }
    }

    // Check if any configuration changed
    const urlChanged = sapUrl !== baseConfig.url;
    const authTypeChanged = "jwt" !== baseConfig.authType;
    const tokenChanged =
      baseConfig.jwtToken !== jwtToken ||
      (!!refreshToken && refreshToken.trim() !== baseConfig.refreshToken);

    if (!urlChanged && !authTypeChanged && !tokenChanged) {
      return;
    }

    const newConfig: SapConfig = {
      ...baseConfig,
      url: sapUrl,
      authType: "jwt",
      jwtToken,
    };

    if (refreshToken && refreshToken.trim()) {
      newConfig.refreshToken = refreshToken.trim();
    }

    setSapConfigOverride(newConfig);
    this.sapConfig = newConfig;

    // Store config and destination in session if sessionId is provided
    if (sessionId) {
      const clientKeyForSession = this.streamableSessionIndex.get(sessionId);
      const session = clientKeyForSession ? this.streamableHttpSessions.get(clientKeyForSession) : undefined;
      if (session) {
        session.sapConfig = newConfig;
        if (destination) {
          session.destination = destination;
        }
      }
    }

    // Force connection cache invalidation (for backward compatibility)
    const { invalidateConnectionCache } = require('./lib/utils');
    try {
      invalidateConnectionCache();
    } catch (error) {
      logger?.debug("Connection cache invalidation failed", {
        type: "CONNECTION_CACHE_INVALIDATION_FAILED",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger?.info("Updated SAP configuration from HTTP headers (JWT)", {
      type: "SAP_CONFIG_UPDATED",
      urlChanged: Boolean(urlChanged),
      authTypeChanged: Boolean(authTypeChanged),
      tokenChanged: Boolean(tokenChanged),
      hasRefreshToken: Boolean(refreshToken),
      jwtPreview: sanitizeToken(jwtToken),
      sessionId: sessionId?.substring(0, 8),
    });
  }

  /**
   * Process JWT config update using AuthBroker for destination-based authentication
   * @private
   */
  private async processJwtConfigUpdateWithAuthBroker(sapUrl: string, destination: string, sessionId?: string) {
    // Get or create AuthBroker for this destination (lazy initialization)
    const authBroker = await this.getOrCreateAuthBroker(destination, sessionId);
    if (!authBroker) {
      logger?.warn("AuthBroker not available, falling back to direct token", {
        type: "AUTH_BROKER_NOT_AVAILABLE",
        destination,
        transport: this.transportConfig.type,
      });
      return;
    }

    try {
      // Get token from AuthBroker (will load from .env, validate, and refresh if needed)
      const jwtToken = await authBroker.getToken(destination);

      // Load refresh token from .env if available (AuthBroker doesn't return it, but we can load it)
      // For now, we'll just use the access token - refresh will be handled by AuthBroker automatically
      const refreshToken = undefined; // AuthBroker handles refresh internally

      // Process JWT config update with the token from AuthBroker
      this.processJwtConfigUpdate(sapUrl, jwtToken, refreshToken, destination, sessionId);

      logger?.info("Updated SAP configuration using AuthBroker (destination-based)", {
        type: "SAP_CONFIG_UPDATED_AUTH_BROKER",
        destination,
        url: sapUrl,
        sessionId: sessionId?.substring(0, 8),
      });
    } catch (error) {
      logger?.error("Failed to get token from AuthBroker", {
        type: "AUTH_BROKER_ERROR",
        destination,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - let the request continue with existing config or fail later
    }
  }

  private processBasicAuthConfigUpdate(sapUrl: string, username: string, password: string, sessionId?: string) {
    let baseConfig: SapConfig | undefined = this.sapConfig;
    if (!baseConfig || baseConfig.url === "http://placeholder") {
      try {
        baseConfig = getConfig();
      } catch (error) {
        logger?.warn("Failed to load base SAP config when applying headers", {
          type: "SAP_CONFIG_HEADER_APPLY_FAILED",
          error: error instanceof Error ? error.message : String(error),
        });
        baseConfig = {
          url: sapUrl,
          authType: "basic",
        };
      }
    }

    // Check if any configuration changed
    const urlChanged = sapUrl !== baseConfig.url;
    const authTypeChanged = "basic" !== baseConfig.authType;
    const credentialsChanged =
      baseConfig.username !== username ||
      baseConfig.password !== password;

    if (!urlChanged && !authTypeChanged && !credentialsChanged) {
      return;
    }

    const newConfig: SapConfig = {
      ...baseConfig,
      url: sapUrl,
      authType: "basic",
      username,
      password,
    };

    setSapConfigOverride(newConfig);
    this.sapConfig = newConfig;

    // Store config in session if sessionId is provided
    if (sessionId) {
      const clientKeyForSession = this.streamableSessionIndex.get(sessionId);
      const session = clientKeyForSession ? this.streamableHttpSessions.get(clientKeyForSession) : undefined;
      if (session) {
        session.sapConfig = newConfig;
      }
    }

    // Force connection cache invalidation (for backward compatibility)
    const { invalidateConnectionCache } = require('./lib/utils');
    try {
      invalidateConnectionCache();
    } catch (error) {
      logger?.debug("Connection cache invalidation failed", {
        type: "CONNECTION_CACHE_INVALIDATION_FAILED",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger?.info("Updated SAP configuration from HTTP headers (Basic)", {
      type: "SAP_CONFIG_UPDATED",
      urlChanged: Boolean(urlChanged),
      authTypeChanged: Boolean(authTypeChanged),
      credentialsChanged: Boolean(credentialsChanged),
      hasUsername: Boolean(username),
      sessionId: sessionId?.substring(0, 8),
    });
  }

  /**
   * Check if connection is from localhost
   */
  private isLocalConnection(remoteAddress?: string): boolean {
    if (!remoteAddress) {
      return false;
    }
    // Check for IPv4 localhost
    if (remoteAddress === "127.0.0.1" || remoteAddress === "localhost") {
      return true;
    }
    // Check for IPv6 localhost
    if (remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1") {
      return true;
    }
    // Check if it's a loopback interface
    if (remoteAddress.startsWith("127.") || remoteAddress.startsWith("::1")) {
      return true;
    }
    return false;
  }

  /**
   * Check if server is listening on non-local interface (0.0.0.0)
   * When listening on 0.0.0.0, we don't use default destination - client must provide all headers
   */
  private isListeningOnNonLocalInterface(): boolean {
    if (this.transportConfig.type === "streamable-http" || this.transportConfig.type === "sse") {
      const host = this.transportConfig.host;
      // If host is 0.0.0.0, ::, or empty, it accepts connections from all interfaces
      return host === "0.0.0.0" || host === "::" || host === "" || !host;
    }
    // stdio is always local
    return false;
  }

  /**
   * Check if request has SAP connection headers
   */
  private hasSapHeaders(headers?: IncomingHttpHeaders): boolean {
    if (!headers) {
      return false;
    }
    // Check for destination-based auth headers
    if (headers[HEADER_SAP_DESTINATION_SERVICE] || headers[HEADER_MCP_DESTINATION]) {
      return true;
    }
    // Check for direct auth headers
    const sapUrl = headers[HEADER_SAP_URL];
    const sapAuthType = headers[HEADER_SAP_AUTH_TYPE];
    return !!(sapUrl && sapAuthType);
  }

  /**
   * Constructor for the mcp_abap_adt_server class.
   */
  constructor(options?: ServerOptions) {
    this.allowProcessExit = options?.allowProcessExit ?? true;
    this.registerSignalHandlers = options?.registerSignalHandlers ?? true;
    this.defaultMcpDestination = defaultMcpDestination;
    this.envFilePath = envFilePath; // Store .env file path for SessionStore creation

    // Initialize AuthBroker factory
    this.authBrokerFactory = new AuthBrokerFactory({
      defaultMcpDestination: this.defaultMcpDestination,
      defaultDestination: this.defaultDestination,
      envFilePath: this.envFilePath,
      authBrokerPath,
      unsafe,
      transportType: transportType,
      logger,
    });

    this.mcpHandlers = new McpHandlers();

    // Check if .env file exists (was loaded at startup)
    // This is used to determine if we should restrict non-local connections
    this.hasEnvFile = fs.existsSync(envFilePath || path.resolve(process.cwd(), ".env"));

    if (options?.connection) {
      setAbapConnectionOverride(options.connection);
    } else {
      setAbapConnectionOverride(undefined);
    }

    if (!options?.connection) {
      setSapConfigOverride(options?.sapConfig);
    }

    // CHANGED: Don't validate config in constructor - will validate on actual ABAP requests
    // This allows creating server instance without .env file when using runtime config (e.g., from HTTP headers)
    try {
      if (options?.sapConfig) {
        this.sapConfig = options.sapConfig;
      } else if (!options?.connection) {
        // Try to get config, but don't fail if it's invalid - server should still initialize
        // Invalid config will be caught when handlers try to use it
        try {
          this.sapConfig = getConfig();
        } catch (configError) {
          // For stdio mode, we want the server to initialize even with invalid config
          // The error will be shown when user tries to use a tool
          // Check stdio mode using environment variable or stdin check (transportConfig not set yet)
          const isStdioMode = process.env.MCP_TRANSPORT === "stdio" || !process.stdin.isTTY;

          if (isStdioMode) {
            // In stdio mode, write error to stderr (safe for MCP protocol)
            process.stderr.write(`[MCP] ⚠ WARNING: Invalid SAP configuration: ${configError instanceof Error ? configError.message : String(configError)}\n`);
            process.stderr.write(`[MCP]   Server will start, but tools will fail until configuration is fixed.\n`);
          }

          logger?.warn("SAP config invalid at initialization, will use placeholder", {
            type: "CONFIG_INVALID",
            error: configError instanceof Error ? configError.message : String(configError),
          });
          // Set a placeholder that will be replaced when valid config is provided
          this.sapConfig = { url: "http://placeholder", authType: "jwt", jwtToken: "placeholder" };
        }
      } else {
        this.sapConfig = { url: "http://injected-connection", authType: "jwt", jwtToken: "injected" };
      }
    } catch (error) {
      // If config is not available yet, that's OK - it will be provided later via setSapConfigOverride or DI
      logger?.warn("SAP config not available at initialization, will use runtime config", {
        type: "CONFIG_DEFERRED",
        error: error instanceof Error ? error.message : String(error),
      });
      // Set a placeholder that will be replaced
      this.sapConfig = { url: "http://placeholder", authType: "jwt", jwtToken: "placeholder" };
    }

    try {
      this.transportConfig = options?.transportConfig ?? parseTransportConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Always write error to stderr (stderr is safe even in stdio mode)
      logger?.error("Failed to parse transport configuration", {
        type: "TRANSPORT_CONFIG_ERROR",
        error: message,
      });
      process.stderr.write(`[MCP] ✗ ERROR: Failed to parse transport configuration: ${message}\n`);
      if (this.allowProcessExit) {
        // On Windows, add a small delay before exit to allow error message to be visible
        if (process.platform === 'win32') {
          setTimeout(() => process.exit(1), 100);
        } else {
          process.exit(1);
        }
      }
      throw error instanceof Error ? error : new Error(message);
    }

    // Create McpServer (for all transports)
    this.mcpServer = new McpServer({
      name: "mcp-abap-adt",
      version: "0.1.0"
    });

    // AuthBroker will be initialized lazily when needed (per destination)
    // Only for HTTP/streamable-http transport (not for stdio or SSE)
    const isHttpTransport = this.transportConfig.type === "streamable-http";
    if (isHttpTransport && !useAuthBroker) {
      // Only initialize if --auth-broker flag is NOT set (for stdio/SSE, ignore the flag)
      // For stdio/SSE, --auth-broker flag is ignored
    } else if (isHttpTransport && useAuthBroker) {
      // Support DEBUG_AUTH_BROKER as alias for DEBUG_AUTH_LOG
      // If DEBUG_AUTH_BROKER is set, ensure DEBUG_AUTH_LOG is also set for auth-broker package
      if (process.env.DEBUG_AUTH_BROKER === "true" && !process.env.DEBUG_AUTH_LOG) {
        process.env.DEBUG_AUTH_LOG = "true";
      }

      // Get paths for service keys and sessions
      // Use authBrokerPath if provided, otherwise use default platform paths
      // If authBrokerPath is provided, it's the base path - service-keys and sessions will be subdirectories
      const customPath = authBrokerPath ? path.resolve(authBrokerPath.replace(/^~/, os.homedir())) : undefined;
      const serviceKeysPaths = getPlatformPaths(customPath, 'service-keys');
      const sessionsPaths = getPlatformPaths(customPath, 'sessions');

      // Create directories if they don't exist
      const fs = require('fs');
      const serviceKeysDir = serviceKeysPaths[0]; // First path is where we save
      const sessionsDir = sessionsPaths[0]; // First path is where we save

      if (!fs.existsSync(serviceKeysDir)) {
        fs.mkdirSync(serviceKeysDir, { recursive: true });
        logger?.info("Created service keys directory", {
          type: "SERVICE_KEYS_DIR_CREATED",
          path: serviceKeysDir,
        });
      }

      if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
        logger?.info("Created sessions directory", {
          type: "SESSIONS_DIR_CREATED",
          path: sessionsDir,
        });
      }

      logger?.info("AuthBroker will be initialized lazily when destination is needed", {
        type: "AUTH_BROKER_LAZY_INIT",
        transport: this.transportConfig.type,
        useAuthBrokerFlag: useAuthBroker,
        hasEnvFile: !!envFilePath,
        authBrokerPath: customPath || 'default',
      });

      // Print paths information with stars and empty lines
      console.log('');
      console.log('********************************************************************************');
      console.log('* AuthBroker Storage Paths:');
      console.log('*');
      console.log('* Service Keys (searched in order):');
      serviceKeysPaths.forEach((p, i) => {
        console.log(`*   ${i + 1}. ${p}`);
      });
      console.log('*');
      console.log('* Sessions (saved to):');
      sessionsPaths.forEach((p, i) => {
        console.log(`*   ${i + 1}. ${p}`);
      });
      console.log('********************************************************************************');
      console.log('');
    } else {
      logger?.info("AuthBroker not available - not needed for this transport type", {
        type: "AUTH_BROKER_SKIPPED",
        transport: this.transportConfig.type,
        reason: "AuthBroker is only used for HTTP/streamable-http transport. For stdio/SSE, use .env file instead.",
      });
    }

    if (this.transportConfig.type === "streamable-http") {
      logger?.info("Transport configured", {
        type: "TRANSPORT_CONFIG",
        transport: this.transportConfig.type,
        host: this.transportConfig.host,
        port: this.transportConfig.port,
        enableJsonResponse: this.transportConfig.enableJsonResponse,
        allowedOrigins: this.transportConfig.allowedOrigins ?? [],
        allowedHosts: this.transportConfig.allowedHosts ?? [],
        enableDnsRebindingProtection: this.transportConfig.enableDnsRebindingProtection,
      });
    } else if (this.transportConfig.type === "sse") {
      logger?.info("Transport configured", {
        type: "TRANSPORT_CONFIG",
        transport: this.transportConfig.type,
        host: this.transportConfig.host,
        port: this.transportConfig.port,
        allowedOrigins: this.transportConfig.allowedOrigins ?? [],
        allowedHosts: this.transportConfig.allowedHosts ?? [],
        enableDnsRebindingProtection: this.transportConfig.enableDnsRebindingProtection,
      });
    } else {
      logger?.info("Transport configured", {
        type: "TRANSPORT_CONFIG",
        transport: this.transportConfig.type,
      });
    }
  }

  /**
   * Creates AbapConnection from available sources (headers, broker, or .env)
   * @param headers - Optional HTTP headers containing connection info
   * @param sessionId - Optional session ID
   * @param destination - Optional destination name for broker-based auth
   * @returns AbapConnection instance
   * @private
   */
  private async getOrCreateConnectionForServer(
    headers?: IncomingHttpHeaders,
    sessionId?: string,
    destination?: string
  ): Promise<AbapConnection> {
    logger?.info("Creating connection for server", {
      type: "CONNECTION_CREATION_START",
      hasHeaders: !!headers,
      sessionId: sessionId || 'not-provided',
      destination: destination || 'not-provided',
    });

    // Try to get connection from session context first
    const context = sessionContext.getStore();
    if (context?.sapConfig) {
      logger?.info("Using connection from session context", {
        type: "CONNECTION_FROM_SESSION_CONTEXT",
        sessionId: sessionId || 'not-provided',
        url: context.sapConfig.url,
        authType: context.sapConfig.authType,
      });
      const sessionConnection = createAbapConnection(
        context.sapConfig,
        loggerAdapter,
        sessionId || `mcp-server-${randomUUID()}`
      );
      return sessionConnection;
    }

    // If headers provided, create connection from headers
    if (headers && this.hasSapHeaders(headers)) {
      // Get config from headers (already processed by applyAuthHeaders)
      const config = this.sapConfig;
      if (config && config.url !== "http://placeholder" && config.url !== "http://injected-connection") {
        logger?.info("Using connection from headers", {
          type: "CONNECTION_FROM_HEADERS",
          sessionId: sessionId || 'not-provided',
          url: config.url,
          authType: config.authType,
        });
        return createAbapConnection(
          config,
          loggerAdapter,
          sessionId || `mcp-server-${randomUUID()}`
        );
      }
    }

    // If destination provided, create connection via broker
    if (destination) {
      try {
        logger?.info("Attempting to create connection via auth broker", {
          type: "CONNECTION_VIA_BROKER_ATTEMPT",
          destination,
          sessionId: sessionId || 'not-provided',
        });
        const authBroker = await this.getOrCreateAuthBroker(destination, sessionId || 'global');
        if (authBroker) {
          const connConfig = await authBroker.getConnectionConfig(destination);
          if (connConfig?.serviceUrl) {
            const jwtToken = await authBroker.getToken(destination);
            if (jwtToken) {
              const config: SapConfig = {
                url: connConfig.serviceUrl,
                authType: "jwt",
                jwtToken,
              };
              logger?.info("Using connection from auth broker", {
                type: "CONNECTION_FROM_BROKER",
                destination,
                sessionId: sessionId || 'not-provided',
                url: config.url,
                authType: config.authType,
              });
              return createAbapConnection(
                config,
                loggerAdapter,
                sessionId || `mcp-server-${randomUUID()}`
              );
            }
          }
        }
      } catch (error) {
        logger?.warn("Failed to create connection from destination", {
          type: "CONNECTION_FROM_DESTINATION_FAILED",
          destination,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback to default config (from .env or constructor)
    if (this.sapConfig && this.sapConfig.url !== "http://placeholder" && this.sapConfig.url !== "http://injected-connection") {
      logger?.info("Using connection from default config (.env or constructor)", {
        type: "CONNECTION_FROM_DEFAULT_CONFIG",
        sessionId: sessionId || 'not-provided',
        url: this.sapConfig.url,
        authType: this.sapConfig.authType,
      });
      return createAbapConnection(
        this.sapConfig,
        loggerAdapter,
        sessionId || `mcp-server-${randomUUID()}`
      );
    }

    logger?.error("Unable to create connection: no valid configuration available", {
      type: "CONNECTION_CREATION_FAILED",
      hasHeaders: !!headers,
      sessionId: sessionId || 'not-provided',
      destination: destination || 'not-provided',
      hasSapConfig: !!this.sapConfig,
      sapConfigUrl: this.sapConfig?.url || 'not-set',
    });
    throw new Error("Unable to create connection: no valid configuration available");
  }

  /**
   * Creates a new McpServer instance with all handlers registered
   * Used for SSE sessions where each session needs its own server instance
   * @param context - HandlerContext instance to use for handlers
   * @private
   */
  private createMcpServerForSession(context: HandlerContext): McpServer {
    const server = new McpServer({
      name: "mcp-abap-adt",
      version: "0.1.0"
    });

    // Register all tools using McpHandlers
    const handlers = new McpHandlers();
    handlers.RegisterAllToolsOnServer(server, context);

    return server;
  }

  /**
   * Sets up handlers for new McpServer using registerTool (recommended API)
   * @param connection - AbapConnection instance to use for handlers
   * @private
   */
  private setupMcpServerHandlers(context: HandlerContext) {
    // Register all tools using McpHandlers
    this.mcpHandlers.RegisterAllToolsOnServer(this.mcpServer, context);
  }

  private setupSignalHandlers() {
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
    for (const signal of signals) {
      process.on(signal, () => {
        if (this.shuttingDown) {
          return;
        }
        this.shuttingDown = true;
        logger?.info("Received shutdown signal", {
          type: "SERVER_SHUTDOWN_SIGNAL",
          signal,
          transport: this.transportConfig.type,
        });
        void this.shutdown().finally(() => {
          if (this.allowProcessExit) {
            process.exit(0);
          }
        });
      });
    }
  }

  private async shutdown() {
    try {
      await this.mcpServer.close();
    } catch (error) {
      logger?.error("Failed to close MCP server", {
        type: "SERVER_SHUTDOWN_ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Close all SSE sessions
    for (const [sessionId, session] of this.sseSessions.entries()) {
      try {
        await session.transport.close();
        session.server.server.close();
        logger?.debug("SSE session closed during shutdown", {
          type: "SSE_SESSION_SHUTDOWN",
          sessionId,
        });
      } catch (error) {
        logger?.error("Failed to close SSE session", {
          type: "SSE_SHUTDOWN_ERROR",
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        });
      }
    }
    this.sseSessions.clear();

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer?.close((closeError) => {
          if (closeError) {
            logger?.error("Failed to close HTTP server", {
              type: "HTTP_SERVER_SHUTDOWN_ERROR",
              error: closeError instanceof Error ? closeError.message : String(closeError),
            });
          }
          resolve();
        });
      });
      this.httpServer = undefined;
    }
  }

  /**
   * Starts the MCP server and connects it to the transport.
   */
  async run() {
    if (this.transportConfig.type === "stdio") {
      // For stdio: must have destination or .env file (error if neither exists)
      if (!this.defaultMcpDestination && !this.hasEnvFile) {
        const errorMsg = "stdio transport requires either --mcp parameter or .env file";
        logger?.error(errorMsg, {
          type: "STDIO_NO_DESTINATION_ERROR",
        });
        process.stderr.write(`[MCP] ✗ ERROR: ${errorMsg}\n`);
        process.stderr.write(`[MCP]   Please provide --mcp=<destination> parameter or ensure .env file exists in current directory.\n`);
        if (this.allowProcessExit) {
          process.exit(1);
        }
        throw new Error(errorMsg);
      }

      // Initialize default broker (creates broker with default destination from --mcp or .env)
      await this.initializeDefaultBroker();

      // If default destination exists, connect to ABAP automatically
      if (this.defaultDestination) {
        try {
          const authBroker = await this.getOrCreateAuthBroker(this.defaultDestination, 'global');
          if (authBroker) {
            const connConfig = await authBroker.getConnectionConfig(this.defaultDestination);
            if (connConfig?.serviceUrl) {
              const jwtToken = await authBroker.getToken(this.defaultDestination);
              if (jwtToken) {
                // Register AuthBroker in global registry for connection to use during token refresh
                const { registerAuthBroker } = require('./lib/utils');
                registerAuthBroker(this.defaultDestination, authBroker);
                this.processJwtConfigUpdate(connConfig.serviceUrl, jwtToken, undefined, this.defaultDestination);
                logger?.info("SAP configuration initialized for stdio transport", {
                  type: "STDIO_DESTINATION_INIT",
                  destination: this.defaultDestination,
                  url: connConfig.serviceUrl,
                });
              }
            }
          }
        } catch (error) {
          logger?.warn("Failed to initialize connection with default destination for stdio transport", {
            type: "STDIO_DESTINATION_INIT_FAILED",
            destination: this.defaultDestination,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Create connection for stdio mode
      const connection = await this.getOrCreateConnectionForServer(
        undefined, // no headers in stdio
        'stdio-session',
        this.defaultDestination
      );

      // Setup handlers with connection
      this.setupMcpServerHandlers({ connection, logger: loggerAdapter });

      // Simple stdio setup like reference implementation
      const transport = new StdioServerTransport();
      await this.mcpServer.server.connect(transport);
      // Process stays alive waiting for messages from stdin
      return;
    }

    if (this.transportConfig.type === "streamable-http") {
      const httpConfig = this.transportConfig;

      // HTTP Server wrapper for StreamableHTTP transport (like the SDK example)
      const httpServer = createServer(async (req, res) => {
        // Log incoming HTTP request (if debug enabled)
        const debugHttpEnabled = process.env.DEBUG_HTTP_REQUESTS === "true" || process.env.DEBUG_CONNECTORS === "true";
        if (debugHttpEnabled) {
          const sanitizedHeaders: Record<string, string> = {};
          const sensitiveKeys = [HEADER_AUTHORIZATION, HEADER_SAP_JWT_TOKEN, HEADER_SAP_REFRESH_TOKEN, HEADER_SAP_PASSWORD, HEADER_SAP_UAA_CLIENT_SECRET];
          for (const [key, value] of Object.entries(req.headers)) {
            if (sensitiveKeys.includes(key.toLowerCase())) {
              sanitizedHeaders[key] = '[REDACTED]';
            } else {
              sanitizedHeaders[key] = Array.isArray(value) ? value.join(', ') : (value || '');
            }
          }
          logger?.info("HTTP Request received", {
            type: "HTTP_REQUEST",
            method: req.method,
            url: req.url,
            headers: sanitizedHeaders,
            remoteAddress: req.socket.remoteAddress,
            remotePort: req.socket.remotePort,
          });
        }

        // Only handle POST requests (like the example)
        if (req.method !== "POST") {
          if (debugHttpEnabled) {
            logger?.warn("HTTP Method not allowed", {
              type: "HTTP_METHOD_NOT_ALLOWED",
              method: req.method,
              url: req.url,
            });
          }
          res.writeHead(405, { "Content-Type": "text/plain" });
          res.end("Method not allowed");
          return;
        }

        // HTTP: Restrict non-local connections if .env file exists and no SAP headers provided
        const remoteAddress = req.socket.remoteAddress;
        if (this.hasEnvFile && !this.hasSapHeaders(req.headers)) {
          if (!this.isLocalConnection(remoteAddress)) {
            logger?.warn("HTTP: Non-local connection rejected (has .env but no SAP headers)", {
              type: "HTTP_NON_LOCAL_REJECTED",
              remoteAddress,
              hasEnvFile: this.hasEnvFile,
            });
            res.writeHead(403, { "Content-Type": "text/plain" });
            res.end(`Forbidden: Non-local connections require SAP connection headers (${HEADER_SAP_URL}, ${HEADER_SAP_AUTH_TYPE})`);
            return;
          }
        }

        // Track client (like the example)
        const clientID = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
        logger?.debug("Client connected", {
          type: "STREAMABLE_HTTP_CLIENT_CONNECTED",
          clientID,
        });

        // Extract session ID from headers (like the example)
        const clientSessionId = (req.headers["x-session-id"] || req.headers["mcp-session-id"]) as string | undefined;

        let session = this.streamableHttpSessions.get(clientID);
        if (session && !this.streamableSessionIndex.has(session.sessionId)) {
          this.streamableSessionIndex.set(session.sessionId, clientID);
        }

        // If client sent session ID, try to find existing session
        if (clientSessionId && !session) {
          // Search for existing session by sessionId (client might have new IP:PORT)
          for (const [key, sess] of this.streamableHttpSessions.entries()) {
            if (sess.sessionId === clientSessionId) {
              session = sess;
              // Update clientID (port might have changed)
              this.streamableHttpSessions.delete(key);
              this.streamableHttpSessions.set(clientID, session);
              this.streamableSessionIndex.set(session.sessionId, clientID);
              logger?.debug("Existing session restored", {
                type: "STREAMABLE_HTTP_SESSION_RESTORED",
                sessionId: session.sessionId,
                clientID,
              });
              break;
            }
          }
        }

        // If no session found, create new one
        if (!session) {
          session = {
            sessionId: randomUUID(),
            clientIP: req.socket.remoteAddress || "unknown",
            connectedAt: new Date(),
            requestCount: 0,
          };
          this.streamableHttpSessions.set(clientID, session);
          this.streamableSessionIndex.set(session.sessionId, clientID);
          logger?.debug("New session created", {
            type: "STREAMABLE_HTTP_SESSION_CREATED",
            sessionId: session.sessionId,
            clientID,
            totalSessions: this.streamableHttpSessions.size,
          });
        }

        session.requestCount++;

        logger?.debug("Request received", {
          type: "STREAMABLE_HTTP_REQUEST",
          sessionId: session.sessionId,
          requestNumber: session.requestCount,
          clientID,
        });

        // Handle client disconnect (like the example)
        req.on("close", () => {
          const closedSession = this.streamableHttpSessions.get(clientID);
          if (closedSession) {
            // Clean up connection cache for this session
            // Include destination to ensure correct connection is removed
            if (closedSession.sapConfig) {
              removeConnectionForSession(closedSession.sessionId, closedSession.sapConfig, closedSession.destination);
            }
            this.streamableHttpSessions.delete(clientID);
            this.streamableSessionIndex.delete(closedSession.sessionId);
            logger?.debug("Session closed", {
              type: "STREAMABLE_HTTP_SESSION_CLOSED",
              sessionId: closedSession.sessionId,
              requestCount: closedSession.requestCount,
              totalSessions: this.streamableHttpSessions.size,
            });
          }
        });

        try {
          // Read request body first to check if this request requires SAP config
          let body: any = null;
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          if (chunks.length > 0) {
            const bodyString = Buffer.concat(chunks).toString('utf-8');
            try {
              body = JSON.parse(bodyString);
              // Log MCP request (if debug enabled)
              const debugHttpEnabled = process.env.DEBUG_HTTP_REQUESTS === "true" || process.env.DEBUG_CONNECTORS === "true";
              if (debugHttpEnabled && body && typeof body === 'object') {
                const mcpMethod = body.method || body.jsonrpc ? 'JSON-RPC' : 'Unknown';
                const sanitizedParams: any = {};
                if (body.params && typeof body.params === 'object') {
                  // Sanitize sensitive params
                  for (const [key, value] of Object.entries(body.params)) {
                    const lowerKey = key.toLowerCase();
                    if (lowerKey.includes('password') || lowerKey.includes('token') || lowerKey.includes('secret')) {
                      sanitizedParams[key] = '[REDACTED]';
                    } else {
                      sanitizedParams[key] = value;
                    }
                  }
                }
                logger?.info("MCP Request", {
                  type: "MCP_REQUEST",
                  method: mcpMethod,
                  jsonrpc: body.jsonrpc,
                  id: body.id,
                  params: sanitizedParams,
                  sessionId: session.sessionId,
                });
              }
            } catch (parseError) {
              // If body is not JSON, pass as string or null
              body = bodyString || null;
              if (debugHttpEnabled) {
                logger?.warn("Failed to parse request body as JSON", {
                  type: "HTTP_BODY_PARSE_ERROR",
                  error: parseError instanceof Error ? parseError.message : String(parseError),
                });
              }
            }
          }

          // Check if this is a request that requires SAP connection
          // Only tools/call requires SAP config - all other methods (tools/list, tools/get, initialize, ping, etc.) don't
          const isMethodRequest = body && typeof body === 'object' && body.method;
          const methodName = isMethodRequest ? String(body.method) : '';
          const requiresSapConfig = methodName === 'tools/call';

          // Apply auth headers before processing and store config in session
          // Apply headers if:
          // 1. This request requires SAP config (tools/call)
          // 2. AND (auth headers are present OR defaultMcpDestination is set)
          // If no headers are present and no defaultMcpDestination, fall back to .env file or base config
          if (requiresSapConfig && (this.hasSapHeaders(req.headers) || this.defaultMcpDestination)) {
            await this.applyAuthHeaders(req.headers, session.sessionId, clientID);
          }

          // Get SAP config for this session (from headers or existing session)
          // Re-read session config after applyAuthHeaders (it may have been updated)
          const updatedSession = this.streamableHttpSessions.get(clientID);
          let sessionSapConfig = updatedSession?.sapConfig || session.sapConfig || this.sapConfig;

          // If no headers provided and no session config, try to reload from .env file
          // This handles the case when .env file exists but config wasn't loaded properly
          // Skip .env reload if defaultMcpDestination is set (use auth-broker instead)
          if (requiresSapConfig && !this.hasSapHeaders(req.headers) && !this.defaultMcpDestination && (!sessionSapConfig || sessionSapConfig.url === "http://placeholder" || sessionSapConfig.url === "http://injected-connection")) {
            try {
              // Try to reload config from .env file
              const envConfig = getConfig();
              if (envConfig && envConfig.url && envConfig.url !== "http://placeholder" && envConfig.url !== "http://injected-connection") {
                // URL from getConfig() is already cleaned (it uses cleanUrl internally)
                // Just use it as-is
                const cleanedUrl = envConfig.url;

                // Validate URL format
                if (/^https?:\/\//.test(cleanedUrl)) {
                  // Update config with cleaned URL
                  const cleanedConfig = { ...envConfig, url: cleanedUrl };
                  this.sapConfig = cleanedConfig;
                  sessionSapConfig = cleanedConfig;
                  logger?.debug("Reloaded SAP config from .env file for HTTP request", {
                    type: "SAP_CONFIG_RELOADED_FROM_ENV",
                    sessionId: session.sessionId,
                    url: cleanedUrl,
                  });
                } else {
                  logger?.warn("Invalid URL format after cleaning", {
                    type: "INVALID_URL_AFTER_CLEANING",
                    url: cleanedUrl,
                  });
                }
              }
            } catch (configError) {
              // Config reload failed, continue with existing config
              logger?.debug("Failed to reload config from .env file", {
                type: "SAP_CONFIG_RELOAD_FAILED",
                error: configError instanceof Error ? configError.message : String(configError),
              });
            }
          }

          // Validate that we have a real config (not placeholder) only for requests that need it
          if (requiresSapConfig && (!sessionSapConfig || sessionSapConfig.url === "http://placeholder" || sessionSapConfig.url === "http://injected-connection")) {
            // Check what headers were provided
            const providedHeaders: Record<string, string> = {};
            if (req.headers[HEADER_SAP_DESTINATION_SERVICE]) providedHeaders[HEADER_SAP_DESTINATION_SERVICE] = String(req.headers[HEADER_SAP_DESTINATION_SERVICE]);
            if (req.headers[HEADER_MCP_DESTINATION]) providedHeaders[HEADER_MCP_DESTINATION] = String(req.headers[HEADER_MCP_DESTINATION]);
            if (req.headers[HEADER_SAP_URL]) providedHeaders[HEADER_SAP_URL] = '[present]';
            if (req.headers[HEADER_SAP_AUTH_TYPE]) providedHeaders[HEADER_SAP_AUTH_TYPE] = String(req.headers[HEADER_SAP_AUTH_TYPE]);

            const errorMessage = `No valid SAP configuration available. Please provide authentication headers (${HEADER_SAP_URL}, ${HEADER_SAP_AUTH_TYPE}, etc.) or ensure destination is configured correctly.`;
            logger?.error("No valid SAP configuration available for request", {
              type: "NO_VALID_SAP_CONFIG",
              sessionId: session.sessionId,
              method: methodName,
              hasSessionConfig: !!updatedSession?.sapConfig,
              hasBaseConfig: !!this.sapConfig,
              baseConfigUrl: this.sapConfig?.url,
              providedHeaders: Object.keys(providedHeaders).length > 0 ? providedHeaders : 'none',
              hasAuthBroker: this.transportConfig.type === "streamable-http",
              hint: "For destination-based auth, ensure service key file exists and destination name matches exactly (case-sensitive). For direct auth, provide x-sap-url and x-sap-auth-type headers.",
            });

            // Return error response to client
            if (!res.headersSent) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({
                jsonrpc: "2.0",
                id: null,
                error: {
                  code: -32603,
                  message: errorMessage,
                  data: {
                    type: "NO_VALID_SAP_CONFIG",
                    hint: "Provide authentication headers or configure destination correctly",
                  },
                },
              }));
            }
            return;
          }

          // Create connection for this request
          const connection = await this.getOrCreateConnectionForServer(
            req.headers,
            session.sessionId,
            updatedSession?.destination || this.defaultDestination
          );

          // Create new McpServer instance for this request
          const requestServer = new McpServer({
            name: "mcp-abap-adt",
            version: "0.1.0"
          });

          // Register all tools using McpHandlers
          const handlers = new McpHandlers();
          handlers.RegisterAllToolsOnServer(requestServer, { connection, logger: loggerAdapter });

          // KEY MOMENT: Create new StreamableHTTP transport for each request (like the SDK example)
          // SDK automatically handles:
          // - Chunked transfer encoding
          // - Session tracking
          // - JSON-RPC protocol
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined, // Stateless mode (like the SDK example)
            enableJsonResponse: httpConfig.enableJsonResponse,
            allowedOrigins: httpConfig.allowedOrigins,
            allowedHosts: httpConfig.allowedHosts,
            enableDnsRebindingProtection: httpConfig.enableDnsRebindingProtection,
          });

          // Close transport when response closes (like the SDK example)
          res.on("close", () => {
            transport.close();
          });

          // Connect transport to new McpServer (like the SDK example)
          await requestServer.connect(transport);

          logger?.debug("Transport connected", {
            type: "STREAMABLE_HTTP_TRANSPORT_CONNECTED",
            sessionId: session.sessionId,
            clientID,
          });

          // Run handlers in AsyncLocalStorage context with session info
          // This allows getManagedConnection() to access sessionId, config, and destination
          const sessionDestination = updatedSession?.destination;
          await sessionContext.run(
            {
              sessionId: session.sessionId,
              sapConfig: sessionSapConfig,
              destination: sessionDestination,
            },
            async () => {
              // Handle HTTP request through transport (like the SDK example)
              // Pass body as third parameter if available (like the SDK example)
              await transport.handleRequest(req, res, body);
            }
          );

          logger?.debug("Request completed", {
            type: "STREAMABLE_HTTP_REQUEST_COMPLETED",
            sessionId: session.sessionId,
            clientID,
          });
        } catch (error) {
          logger?.error("Failed to handle HTTP request", {
            type: "HTTP_REQUEST_ERROR",
            error: error instanceof Error ? error.message : String(error),
            sessionId: session.sessionId,
            clientID,
          });
          if (!res.headersSent) {
            res.writeHead(500).end("Internal Server Error");
          } else {
            res.end();
          }
        }
      });

      httpServer.on("clientError", (err, socket) => {
        logger?.error("HTTP client error", {
          type: "HTTP_CLIENT_ERROR",
          error: err instanceof Error ? err.message : String(err),
        });
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      });

      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          logger?.error("HTTP server failed to start", {
            type: "HTTP_SERVER_ERROR",
            error: error.message,
          });
          httpServer.off("error", onError);
          reject(error);
        };

        httpServer.once("error", onError);
        httpServer.listen(httpConfig.port, httpConfig.host, () => {
          httpServer.off("error", onError);
          logger?.info("HTTP server listening", {
            type: "HTTP_SERVER_LISTENING",
            host: httpConfig.host,
            port: httpConfig.port,
            enableJsonResponse: httpConfig.enableJsonResponse,
          });
          resolve();
        });
      });

      this.httpServer = httpServer;
      return;
    }

    const sseConfig = this.transportConfig;

    // Initialize default broker if destination/.env exists (for SSE: optional, wait for headers if not)
    if (this.defaultMcpDestination || this.hasEnvFile) {
      await this.initializeDefaultBroker();

      // If default destination exists, connect to ABAP automatically
      if (this.defaultDestination) {
        try {
          const authBroker = await this.getOrCreateAuthBroker(this.defaultDestination, 'global');
          if (authBroker) {
            const connConfig = await authBroker.getConnectionConfig(this.defaultDestination);
            if (connConfig?.serviceUrl) {
              const jwtToken = await authBroker.getToken(this.defaultDestination);
              if (jwtToken) {
                // Register AuthBroker in global registry for connection to use during token refresh
                const { registerAuthBroker } = require('./lib/utils');
                registerAuthBroker(this.defaultDestination, authBroker);
                this.processJwtConfigUpdate(connConfig.serviceUrl, jwtToken, undefined, this.defaultDestination);
                logger?.info("SAP configuration initialized for SSE transport", {
                  type: "SSE_DESTINATION_INIT",
                  destination: this.defaultDestination,
                  url: connConfig.serviceUrl,
                });
              }
            }
          }
        } catch (error) {
          logger?.warn("Failed to initialize connection with default destination for SSE transport", {
            type: "SSE_DESTINATION_INIT_FAILED",
            destination: this.defaultDestination,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else {
      logger?.debug("No default destination for SSE transport, will wait for headers", {
        type: "SSE_NO_DEFAULT_DESTINATION",
      });
    }

    const streamPathMap = new Map<string, string>([
      ["/", "/messages"],
      ["/mcp/events", "/mcp/messages"],
      ["/sse", "/messages"],
    ]);
    const streamPaths = Array.from(streamPathMap.keys());
    const postPathSet = new Set(streamPathMap.values());
    postPathSet.add("/messages");
    postPathSet.add("/mcp/messages");

    const httpServer = createServer(async (req, res) => {
      // SSE: Always restrict to local connections only
      const remoteAddress = req.socket.remoteAddress;
      if (!this.isLocalConnection(remoteAddress)) {
        logger?.warn("SSE: Non-local connection rejected", {
          type: "SSE_NON_LOCAL_REJECTED",
          remoteAddress,
        });
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden: SSE transport only accepts local connections");
        return;
      }

      const requestUrl = req.url ? new URL(req.url, `http://${req.headers.host ?? `${sseConfig.host}:${sseConfig.port}`}`) : undefined;
      let pathname = requestUrl?.pathname ?? "/";
      if (pathname.length > 1 && pathname.endsWith("/")) {
        pathname = pathname.slice(0, -1);
      }

      await this.applyAuthHeaders(req.headers);

      logger?.debug("SSE request received", {
        type: "SSE_HTTP_REQUEST",
        method: req.method,
        pathname,
        originalUrl: req.url,
        headers: {
          accept: req.headers.accept,
          "content-type": req.headers["content-type"],
        },
      });

      // GET /sse, /mcp/events, or / - establish SSE connection
      if (req.method === "GET" && streamPathMap.has(pathname)) {
        const postEndpoint = streamPathMap.get(pathname) ?? "/messages";

        logger?.debug("SSE client connecting", {
          type: "SSE_CLIENT_CONNECTING",
          pathname,
          postEndpoint,
        });

        // Create connection for this session
        const connection = await this.getOrCreateConnectionForServer(
          req.headers,
          undefined, // sessionId will be set after transport creation
          this.defaultDestination
        );

        // Create new McpServer instance for this session (like the working example)
        const server = this.createMcpServerForSession({ connection, logger: loggerAdapter as unknown as ILogger });

        // Create SSE transport
        const transport = new SSEServerTransport(postEndpoint, res, {
          allowedHosts: sseConfig.allowedHosts,
          allowedOrigins: sseConfig.allowedOrigins,
          enableDnsRebindingProtection: sseConfig.enableDnsRebindingProtection,
        });

        const sessionId = transport.sessionId;
        logger?.info("New SSE session created", {
          type: "SSE_SESSION_CREATED",
          sessionId,
          pathname,
        });

        // Store transport and server for this session
        this.sseSessions.set(sessionId, {
          server,
          transport,
        });

        // Connect transport to server (using server.server like in the example)
        try {
          await server.server.connect(transport);
          logger?.info("SSE transport connected", {
            type: "SSE_CONNECTION_READY",
            sessionId,
            pathname,
            postEndpoint,
          });
        } catch (error) {
          logger?.error("Failed to connect SSE transport", {
            type: "SSE_CONNECT_ERROR",
            error: error instanceof Error ? error.message : String(error),
            sessionId,
          });
          this.sseSessions.delete(sessionId);
          if (!res.headersSent) {
            res.writeHead(500).end("Internal Server Error");
          } else {
            res.end();
          }
          return;
        }

        // Cleanup on connection close
        res.on("close", () => {
          logger?.info("SSE connection closed", {
            type: "SSE_CONNECTION_CLOSED",
            sessionId,
            pathname,
          });
          this.sseSessions.delete(sessionId);
          server.server.close();
        });

        transport.onerror = (error) => {
          logger?.error("SSE transport error", {
            type: "SSE_TRANSPORT_ERROR",
            error: error instanceof Error ? error.message : String(error),
            sessionId,
          });
        };

        return;
      }

      // POST /messages or /mcp/messages - handle client messages
      if (req.method === "POST" && postPathSet.has(pathname)) {
        // Extract sessionId from query string or header
        let sessionId: string | undefined;
        if (requestUrl) {
          sessionId = requestUrl.searchParams.get("sessionId") || undefined;
        }
        if (!sessionId) {
          sessionId = req.headers["x-session-id"] as string | undefined;
        }

        logger?.debug("SSE POST request received", {
          type: "SSE_POST_REQUEST",
          sessionId,
          pathname,
        });

        if (!sessionId || !this.sseSessions.has(sessionId)) {
          logger?.error("Invalid or missing SSE session", {
            type: "SSE_INVALID_SESSION",
            sessionId,
          });
          res.writeHead(400, { "Content-Type": "application/json" }).end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Invalid or missing sessionId",
              },
              id: null,
            })
          );
          return;
        }

        const session = this.sseSessions.get(sessionId)!;
        const { transport } = session;

        try {
          // Read request body
          let body: any = null;
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          if (chunks.length > 0) {
            const bodyString = Buffer.concat(chunks).toString('utf-8');
            try {
              body = JSON.parse(bodyString);
            } catch (parseError) {
              body = bodyString || null;
            }
          }

          // Handle POST message through transport (like the working example)
          await transport.handlePostMessage(req, res, body);

          logger?.debug("SSE POST request processed", {
            type: "SSE_POST_PROCESSED",
            sessionId,
          });
        } catch (error) {
          logger?.error("Failed to handle SSE POST message", {
            type: "SSE_POST_ERROR",
            error: error instanceof Error ? error.message : String(error),
            sessionId,
          });
          if (!res.headersSent) {
            res.writeHead(500).end("Internal Server Error");
          } else {
            res.end();
          }
        }
        return;
      }

      // OPTIONS - CORS preflight
      if (req.method === "OPTIONS" && (streamPathMap.has(pathname) || postPathSet.has(pathname))) {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }).end();
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" }).end(
        JSON.stringify({ error: "Not Found" })
      );
    });

    httpServer.on("clientError", (err, socket) => {
      logger?.error("SSE HTTP client error", {
        type: "SSE_HTTP_CLIENT_ERROR",
        error: err instanceof Error ? err.message : String(err),
      });
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        logger?.error("SSE HTTP server failed to start", {
          type: "SSE_HTTP_SERVER_ERROR",
          error: error.message,
        });
        httpServer.off("error", onError);
        reject(error);
      };

      httpServer.once("error", onError);
      httpServer.listen(sseConfig.port, sseConfig.host, () => {
        httpServer.off("error", onError);
        logger?.info("SSE HTTP server listening", {
          type: "SSE_HTTP_SERVER_LISTENING",
          host: sseConfig.host,
          port: sseConfig.port,
          streamPaths,
          postPaths: Array.from(postPathSet.values()),
        });
        resolve();
      });
    });

    this.httpServer = httpServer;
  }
}

if (process.env.MCP_SKIP_AUTO_START !== "true") {
  const server = new mcp_abap_adt_server();
  server.run().catch((error) => {
    logger?.error("Fatal error while running MCP server", {
      type: "SERVER_FATAL_ERROR",
      error: error instanceof Error ? error.message : String(error),
    });
    // Always write to stderr (safe even in stdio mode)
    process.stderr.write(`[MCP] ✗ Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
    // On Windows, add a small delay before exit to allow error message to be visible
    if (process.platform === 'win32') {
      setTimeout(() => process.exit(1), 100);
    } else {
      process.exit(1);
    }
  });
}
