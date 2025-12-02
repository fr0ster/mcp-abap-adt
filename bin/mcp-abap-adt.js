#!/usr/bin/env node

/**
 * MCP ABAP ADT Server Launcher
 *
 * Simple launcher that spawns the main server process as a separate process.
 * This ensures proper network handling on Windows (spawn vs require).
 * Server handles all .env parsing itself.
 *
 * Usage:
 *   mcp-abap-adt [options]
 *   mcp-abap-adt --env=e19.env --transport=stdio
 *   mcp-abap-adt --env=/path/to/.env --transport=http
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    help: false,
    version: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--version' || arg === '-v') {
      result.version = true;
    }
  }

  return result;
}

// Show help
function showHelp() {
  const pkg = require('../package.json');
  console.log(`
MCP ABAP ADT Server v${pkg.version}

Usage:
  mcp-abap-adt [options]

Options:
  --env=<file>              Path to .env file (default: .env in current directory)
  --auth-broker             Force use of auth-broker (service keys) instead of .env file
                            Ignores .env file even if present in current directory
  --transport=<type>       Transport type: stdio, http, streamable-http, sse, server
  --http-port=<port>       HTTP server port (default: 3000)
  --sse-port=<port>        SSE server port (default: 3001)
  --http-host=<host>       HTTP server host (default: 0.0.0.0)
  --sse-host=<host>        SSE server host (default: 0.0.0.0)
  --skip-auto-start        Skip automatic server start (for testing)
  --help, -h               Show this help message
  --version, -v            Show version number

Environment Variables:
  MCP_HTTP_PORT            HTTP server port (default: 3000)
  MCP_SSE_PORT             SSE server port (default: 3001)
  MCP_HTTP_HOST            HTTP server host (default: 0.0.0.0)
  MCP_SSE_HOST             SSE server host (default: 0.0.0.0)
  MCP_ENV_PATH             Path to .env file
  MCP_TRANSPORT            Transport type (stdio|http|sse)
  AUTH_BROKER_PATH         Custom paths for service keys and sessions
                           Unix: colon-separated (e.g., /path1:/path2)
                           Windows: semicolon-separated (e.g., C:\\path1;C:\\path2)

Examples:
  mcp-abap-adt                                    # Use default .env, HTTP on port 3000
  mcp-abap-adt --env=e19.env                      # Use specific .env file
  mcp-abap-adt --env=e19.env --transport=stdio    # Use .env and stdio transport
  mcp-abap-adt --transport=http                   # HTTP mode (no .env required, port 3000)
  mcp-abap-adt --transport=http --http-port=8080  # HTTP mode on custom port 8080
  mcp-abap-adt --transport=sse --sse-port=3001    # SSE mode on port 3001
  mcp-abap-adt --auth-broker                      # Use service keys instead of .env file

Transport Modes:
  - stdio (default if stdin is not TTY): For MCP clients like Cline/Cursor
  - http / streamable-http: HTTP server (default if stdin is TTY, port 3000)
  - sse: Server-Sent Events server (port 3001)

Service Keys (Auth-Broker):
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

    Storage: ~/.config/mcp-abap-adt/service-keys/{destination}.json

  macOS:
    1. Create service keys directory:
       mkdir -p ~/.config/mcp-abap-adt/service-keys

    2. Download service key from SAP BTP (from the corresponding service instance)
       and copy it to: ~/.config/mcp-abap-adt/service-keys/{destination}.json
       (e.g., TRIAL.json - the filename without .json extension becomes the destination name)

    Storage: ~/.config/mcp-abap-adt/service-keys/{destination}.json

  Windows:
    1. Create service keys directory (PowerShell):
       New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\\Documents\\mcp-abap-adt\\service-keys"

    2. Download service key from SAP BTP (from the corresponding service instance)
       and copy it to: %USERPROFILE%\\Documents\\mcp-abap-adt\\service-keys\\{destination}.json
       (e.g., TRIAL.json - the filename without .json extension becomes the destination name)

    Or using Command Prompt (cmd):
       mkdir "%USERPROFILE%\\Documents\\mcp-abap-adt\\service-keys"
       (Then copy the downloaded service key file to this directory)

    Storage: %USERPROFILE%\\Documents\\mcp-abap-adt\\service-keys\\{destination}.json

  Fallback: Server also searches in current working directory (where server is launched)

  Using Service Keys:
    1. Start server with --auth-broker flag:
       mcp-abap-adt --transport=http --auth-broker

    2. Use destination in HTTP headers:
       x-sap-destination: TRIAL    (for SAP Cloud, URL derived from service key)
       x-mcp-destination: TRIAL    (for MCP destinations, URL derived from service key)

    The destination name must exactly match the service key filename (without .json extension, case-sensitive).

  First-Time Authentication:
    - Server reads service key from {destination}.json
    - Opens browser for OAuth2 authentication (if no valid session exists)
    - Saves tokens to {destination}.env for future use
    - Subsequent requests use cached tokens automatically

  For more details, see: doc/user-guide/CLIENT_CONFIGURATION.md#destination-based-authentication

For more information, see: https://github.com/fr0ster/mcp-abap-adt
`);
}

// Show version
function showVersion() {
  const pkg = require('../package.json');
  console.log(pkg.version);
}

// Main launcher logic
function main() {
  const args = parseArgs();

  // Handle --help
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Handle --version
  if (args.version) {
    showVersion();
    process.exit(0);
  }

  // Spawn the main server process
  // Using spawn() instead of require() ensures proper network handling on Windows
  const serverPath = path.resolve(__dirname, '../dist/index.js');

  if (!fs.existsSync(serverPath)) {
    process.stderr.write(`[MCP] ✗ Server not found at: ${serverPath}\n`);
    process.stderr.write(`[MCP]   Make sure to build the project with 'npm run build' first.\n`);
    if (process.platform === 'win32') {
      setTimeout(() => process.exit(1), 30000);
    } else {
      process.exit(1);
    }
    return;
  }

  // Pass all arguments to server (server handles .env parsing itself)
  const serverArgs = process.argv.slice(2);

  // Use process.execPath (same Node.js that's running launcher) instead of 'node'
  // This avoids path issues on Windows
  const nodeExecPath = process.execPath;

  // Ensure serverPath is properly resolved
  const resolvedServerPath = path.resolve(serverPath);

  // Verify server file exists
  if (!fs.existsSync(resolvedServerPath)) {
    process.stderr.write(`[MCP] ✗ Server file not found: ${resolvedServerPath}\n`);
    if (process.platform === 'win32') {
      setTimeout(() => process.exit(1), 30000);
    } else {
      process.exit(1);
    }
    return;
  }

  // Mark that launcher is running (server should skip .env loading)
  // Server will parse .env itself if needed, but launcher ensures proper spawn on Windows
  const serverEnv = {
    ...process.env,
    MCP_ENV_LOADED_BY_LAUNCHER: 'false', // Server will load .env itself
    MCP_SKIP_ENV_LOAD: 'false', // Allow server to load .env
  };

  // Debug logging for Windows (don't log args to avoid exposing credentials)
  if (process.platform === 'win32') {
    process.stderr.write(`[MCP] Spawning server: ${nodeExecPath} ${resolvedServerPath}\n`);
    process.stderr.write(`[MCP] CWD: ${process.cwd()}\n`);
  }

  // Spawn the server process with inherited stdio
  // This ensures proper network handling on Windows
  // Use process.execPath to avoid path resolution issues
  const serverProcess = spawn(nodeExecPath, [resolvedServerPath, ...serverArgs], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: serverEnv,
    cwd: process.cwd(),
    shell: false, // Explicitly set shell to false
  });

  // Handle server process exit
  serverProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`[MCP] Server exited with code: ${code}\n`);
    }
    process.exit(code || 0);
  });

  // Handle server process errors
  serverProcess.on('error', (error) => {
    process.stderr.write(`[MCP] ✗ Failed to start server: ${error.message}\n`);
    if (error.stack) {
      process.stderr.write(error.stack + '\n');
    }
    if (process.platform === 'win32') {
      setTimeout(() => process.exit(1), 30000);
    } else {
      process.exit(1);
    }
  });

  // Forward SIGINT (Ctrl+C) to server process
  process.on('SIGINT', () => {
    serverProcess.kill('SIGINT');
    setTimeout(() => {
      process.exit(0);
    }, 500);
  });
}

// Run launcher
main();
