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
  --transport=<type>       Transport type: stdio, http, streamable-http, sse, server
  --skip-auto-start        Skip automatic server start (for testing)
  --help, -h               Show this help message
  --version, -v            Show version number

Examples:
  mcp-abap-adt                                    # Use default .env
  mcp-abap-adt --env=e19.env                      # Use specific .env file
  mcp-abap-adt --env=e19.env --transport=stdio    # Use .env and stdio transport
  mcp-abap-adt --transport=http                   # HTTP mode (no .env required)

Transport Modes:
  - stdio (default if stdin is not TTY): For MCP clients like Cline/Cursor
  - http / streamable-http: HTTP server (default if stdin is TTY)
  - sse: Server-Sent Events server
  - server: HTTP server with custom configuration

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

  // Spawn the server process with inherited stdio
  // This ensures proper network handling on Windows
  const serverProcess = spawn('node', [serverPath, ...serverArgs], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: process.env,
    cwd: process.cwd(),
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
