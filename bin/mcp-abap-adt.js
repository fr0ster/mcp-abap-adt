#!/usr/bin/env node

/**
 * MCP ABAP ADT Server
 *
 * This launcher handles .env file loading using dotenv (which works reliably
 * across all platforms) and then starts the main server process.
 *
 * Usage:
 *   mcp-abap-adt [options]
 *   mcp-abap-adt --env=e19.env --transport=stdio
 *   mcp-abap-adt --env=/path/to/.env --transport=http
 */

const path = require('path');
const fs = require('fs');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    envFile: null,
    transport: null,
    skipAutoStart: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // --env=file or --env file
    if (arg.startsWith('--env=')) {
      result.envFile = arg.slice('--env='.length);
    } else if (arg === '--env' && i + 1 < args.length) {
      result.envFile = args[++i];
    }
    // --transport=type or --transport type
    else if (arg.startsWith('--transport=')) {
      result.transport = arg.slice('--transport='.length);
    } else if (arg === '--transport' && i + 1 < args.length) {
      result.transport = args[++i];
    }
    // --skip-auto-start
    else if (arg === '--skip-auto-start') {
      result.skipAutoStart = true;
    }
    // --help or -h
    else if (arg === '--help' || arg === '-h') {
      result.help = true;
    }
    // --version or -v
    else if (arg === '--version' || arg === '-v') {
      result.version = true;
    }
    // Pass through other arguments
    else {
      // Keep other arguments for the main process
    }
  }

  return result;
}

// Load .env file using dotenv
function loadEnvFile(envFilePath) {
  if (!envFilePath) {
    // Try to find .env in current working directory
    const cwdEnvPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(cwdEnvPath)) {
      envFilePath = cwdEnvPath;
    } else {
      return false; // No .env file found
    }
  }

  // Resolve relative paths
  if (!path.isAbsolute(envFilePath)) {
    envFilePath = path.resolve(process.cwd(), envFilePath);
  }

  if (!fs.existsSync(envFilePath)) {
    return false; // File not found
  }

  // Use dotenv to load .env file (works reliably on all platforms)
  try {
    // Load dotenv dynamically to avoid issues if not installed
    const dotenv = require('dotenv');
    // Suppress dotenv output for stdio mode (MCP protocol requires clean JSON only)
    const isStdio = !process.stdin.isTTY;

    // Temporarily suppress stdout/stderr during dotenv loading to prevent any output
    let originalStdoutWrite, originalStderrWrite;
    if (isStdio) {
      originalStdoutWrite = process.stdout.write;
      originalStderrWrite = process.stderr.write;
      process.stdout.write = () => true; // Suppress stdout
      // Keep stderr for error messages, but suppress during dotenv.config()
      process.stderr.write = () => true;
    }

    const result = dotenv.config({
      path: envFilePath,
      encoding: 'utf8', // Explicitly specify UTF-8 encoding for cross-platform compatibility
      debug: false, // Don't output debug info
      override: false // Don't override existing env vars
    });

    // Restore stdout/stderr after dotenv loading
    if (isStdio) {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }

    if (result.error) {
      // Always write to stderr (safe even in stdio mode)
      process.stderr.write(`[MCP] ✗ Failed to load .env file: ${envFilePath}\n`);
      process.stderr.write(`[MCP] Error: ${result.error.message}\n`);
      return false;
    }

    // Clean loaded environment variables (remove \r and trim whitespace)
    // This is especially important on Windows where .env files may have \r\n line endings
    if (result.parsed) {
      for (const key in result.parsed) {
        if (result.parsed.hasOwnProperty(key)) {
          let value = result.parsed[key];
          // Remove \r characters (Windows line endings)
          value = value.replace(/\r/g, '');
          // Trim whitespace
          value = value.trim();
          // Remove quotes if present
          value = value.replace(/^["']|["']$/g, '');
          // Update process.env with cleaned value
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }

    // Verify that key variables were loaded
    const sapUrl = process.env.SAP_URL;
    const sapClient = process.env.SAP_CLIENT;

    // Only write to stderr if not in stdio mode (stdio mode requires clean JSON only)
    if (!isStdio) {
      process.stderr.write(`[MCP] ✓ Loaded .env file: ${envFilePath}\n`);
      if (sapUrl) {
        process.stderr.write(`[MCP] SAP_URL: ${sapUrl}\n`);
      } else {
        process.stderr.write(`[MCP] ⚠ WARNING: SAP_URL not found in .env file\n`);
      }
      if (sapClient) {
        process.stderr.write(`[MCP] SAP_CLIENT: ${sapClient}\n`);
      } else {
        process.stderr.write(`[MCP] ⚠ WARNING: SAP_CLIENT not found in .env file\n`);
      }
    }

    return true;
  } catch (error) {
    // Always write to stderr (safe even in stdio mode)
    process.stderr.write(`[MCP] ✗ Failed to load .env file: ${envFilePath}\n`);
    process.stderr.write(`[MCP] Error: ${error.message}\n`);
    return false;
  }
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

  // Determine if .env is required
  const isStdio = args.transport === 'stdio' || (!args.transport && !process.stdin.isTTY);
  const isSse = args.transport === 'sse';
  const isEnvRequired = (isStdio || isSse) && args.transport !== null;

  // Load .env file if specified or if required
  if (args.envFile || isEnvRequired) {
    const envLoaded = loadEnvFile(args.envFile);

    if (!envLoaded && isEnvRequired) {
      // Always write to stderr (safe even in stdio mode - stderr doesn't interfere with JSON-RPC)
      process.stderr.write(`[MCP] ✗ ERROR: .env file is required for transport mode '${args.transport || 'stdio'}'\n`);
      process.stderr.write(`[MCP]   Use --env=/path/to/.env to specify custom location\n`);

      // In stdio mode (Cline), don't exit - let the server start and show error through MCP protocol
      // The server will fail to initialize and show the error to the client
      if (!isStdio) {
        // For non-stdio modes, exit with delay on Windows
        if (process.platform === 'win32' && process.stdin.isTTY) {
          process.stderr.write(`[MCP] Press Enter to exit...\n`);
          process.stdin.setRawMode(true);
          process.stdin.resume();
          process.stdin.once('data', () => {
            process.exit(1);
          });
          setTimeout(() => process.exit(1), 10000);
        } else if (process.platform === 'win32') {
          setTimeout(() => process.exit(1), 30000);
        } else {
          process.exit(1);
        }
      }
      // For stdio mode, continue - server will show error through MCP protocol when getConfig() is called
    } else if (!envLoaded && args.envFile) {
      // Always write to stderr (safe even in stdio mode)
      process.stderr.write(`[MCP] ✗ ERROR: .env file not found: ${args.envFile}\n`);

      // In stdio mode (Cline), don't exit - let the server start and show error through MCP protocol
      if (!isStdio) {
        // For non-stdio modes, exit with delay on Windows
        if (process.platform === 'win32' && process.stdin.isTTY) {
          process.stderr.write(`[MCP] Press Enter to exit...\n`);
          process.stdin.setRawMode(true);
          process.stdin.resume();
          process.stdin.once('data', () => {
            process.exit(1);
          });
          setTimeout(() => process.exit(1), 10000);
        } else if (process.platform === 'win32') {
          setTimeout(() => process.exit(1), 30000);
        } else {
          process.exit(1);
        }
      }
      // For stdio mode, continue - server will show error through MCP protocol when getConfig() is called
    }
  } else {
    // Try to load default .env (optional)
    loadEnvFile(null);
  }

  // Set transport type in environment if specified
  if (args.transport) {
    process.env.MCP_TRANSPORT = args.transport;
  }

  // Set skip auto start if specified
  if (args.skipAutoStart) {
    process.env.MCP_SKIP_AUTO_START = 'true';
  }

  // Mark that .env was loaded by launcher (so index.ts won't try to load it again)
  process.env.MCP_ENV_LOADED_BY_LAUNCHER = 'true';

  // Now require the main server (it will use process.env values)
  try {
    require('../dist/index.js');
  } catch (error) {
    // Always write to stderr (safe even in stdio mode)
    process.stderr.write(`[MCP] ✗ Failed to start server: ${error.message}\n`);
    if (error.stack) {
      process.stderr.write(error.stack + '\n');
    }
    // On Windows, wait for user input or timeout to allow error message to be visible
    if (process.platform === 'win32') {
      process.stderr.write(`[MCP] Press Enter to exit...\n`);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.exit(1);
      });
      // Also exit after 10 seconds if no input
      setTimeout(() => process.exit(1), 10000);
    } else {
      process.exit(1);
    }
  }
}

// Run launcher
main();
