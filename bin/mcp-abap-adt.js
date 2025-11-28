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
    // dotenv.config() already sets process.env, but we need to clean the values
    if (result.parsed) {
      for (const key in result.parsed) {
        if (result.parsed.hasOwnProperty(key)) {
          // Get the value that dotenv already set in process.env
          let value = process.env[key] || result.parsed[key];

          // Aggressive cleaning for Windows compatibility
          // Step 1: Convert to string and remove ALL control characters (including \r, \n, \t, etc.)
          value = String(value).replace(/[\x00-\x1F\x7F-\x9F]/g, '');
          // Step 2: Trim whitespace from both ends
          value = value.trim();
          // Step 3: Remove quotes if present (both single and double) - handle nested quotes
          value = value.replace(/^["']+|["']+$/g, '');
          // Step 4: Final trim after quote removal
          value = value.trim();
          // Step 5: For URLs specifically, ensure no trailing slashes or spaces
          if (key === 'SAP_URL') {
            value = value.replace(/\/+$/, ''); // Remove trailing slashes
            value = value.trim();
          }

          // Update process.env with cleaned value (override what dotenv set)
          process.env[key] = value;
        }
      }
    }

    // Double-check critical SAP variables after cleaning
    // This ensures they are truly clean before the server starts
    const criticalVars = ['SAP_URL', 'SAP_CLIENT', 'SAP_USERNAME', 'SAP_PASSWORD', 'SAP_JWT_TOKEN'];
    for (const varName of criticalVars) {
      if (process.env[varName]) {
        let value = process.env[varName];
        // Final aggressive clean
        value = String(value).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
        value = value.replace(/^["']+|["']+$/g, '').trim();
        if (varName === 'SAP_URL') {
          value = value.replace(/\/+$/, '').trim();
        }
        process.env[varName] = value;
      }
    }

    // Verify that key variables were loaded and show diagnostic info
    const sapUrl = process.env.SAP_URL;
    const sapClient = process.env.SAP_CLIENT;
    const sapUsername = process.env.SAP_USERNAME;
    const sapPassword = process.env.SAP_PASSWORD;
    const sapAuthType = process.env.SAP_AUTH_TYPE;
    const sapJwtToken = process.env.SAP_JWT_TOKEN;

    // Always write to stderr (stderr is safe even in stdio mode - doesn't interfere with JSON-RPC)
    // Use console.error for better compatibility with MCP Inspector
    // This helps with debugging configuration issues
    console.error(`[MCP] ✓ Loaded .env file: ${envFilePath}`);
    console.error(`[MCP] Loaded environment variables:`);

    // Show all SAP-related variables
    if (sapUrl) {
      // Show full URL for debugging
      const urlLength = sapUrl.length;
      console.error(`[MCP]   SAP_URL: ${sapUrl} (length: ${urlLength})`);
      // Show raw bytes for debugging (especially for Windows line ending issues)
      const urlBytes = Buffer.from(sapUrl, 'utf8').toString('hex');
      if (urlBytes.length > 120) {
        process.stderr.write(`[MCP]   SAP_URL (hex): ${urlBytes.substring(0, 120)}...\n`);
      } else {
        process.stderr.write(`[MCP]   SAP_URL (hex): ${urlBytes}\n`);
      }
      // Check for invalid characters
      if (!/^https?:\/\//.test(sapUrl)) {
        process.stderr.write(`[MCP]   ⚠ WARNING: SAP_URL does not start with http:// or https://\n`);
      }
      // Check for control characters
      if (/[\x00-\x1F\x7F]/.test(sapUrl)) {
        process.stderr.write(`[MCP]   ⚠ WARNING: SAP_URL contains control characters\n`);
      }
    } else {
      process.stderr.write(`[MCP]   SAP_URL: (not set)\n`);
    }

    if (sapClient) {
      process.stderr.write(`[MCP]   SAP_CLIENT: ${sapClient}\n`);
    } else {
      process.stderr.write(`[MCP]   SAP_CLIENT: (not set)\n`);
    }

    if (sapAuthType) {
      process.stderr.write(`[MCP]   SAP_AUTH_TYPE: ${sapAuthType}\n`);
    } else {
      process.stderr.write(`[MCP]   SAP_AUTH_TYPE: (not set, will default to basic)\n`);
    }

    if (sapUsername) {
      process.stderr.write(`[MCP]   SAP_USERNAME: ${sapUsername.substring(0, 10)}... (length: ${sapUsername.length})\n`);
    } else {
      process.stderr.write(`[MCP]   SAP_USERNAME: (not set)\n`);
    }

    if (sapPassword) {
      process.stderr.write(`[MCP]   SAP_PASSWORD: *** (length: ${sapPassword.length})\n`);
    } else {
      process.stderr.write(`[MCP]   SAP_PASSWORD: (not set)\n`);
    }

    if (sapJwtToken) {
      const tokenPreview = sapJwtToken.length > 30 ? sapJwtToken.substring(0, 30) + '...' : sapJwtToken;
      process.stderr.write(`[MCP]   SAP_JWT_TOKEN: ${tokenPreview} (length: ${sapJwtToken.length})\n`);
    } else {
      process.stderr.write(`[MCP]   SAP_JWT_TOKEN: (not set)\n`);
    }

    // Only write additional info if not in stdio mode
    if (!isStdio) {
      process.stderr.write(`[MCP] ✓ Loaded .env file: ${envFilePath}\n`);
      process.stderr.write(`[MCP] Loaded environment variables:\n`);

      // Show all SAP-related variables
      if (sapUrl) {
        // Show URL length and first/last characters for debugging
        const urlLength = sapUrl.length;
        const urlPreview = urlLength > 60 ? sapUrl.substring(0, 60) + '...' : sapUrl;
        process.stderr.write(`[MCP]   SAP_URL: ${urlPreview} (length: ${urlLength})\n`);
        // Show raw bytes for debugging (especially for Windows line ending issues)
        const urlBytes = Buffer.from(sapUrl, 'utf8').toString('hex');
        if (urlBytes.length > 120) {
          process.stderr.write(`[MCP]   SAP_URL (hex): ${urlBytes.substring(0, 120)}...\n`);
        } else {
          process.stderr.write(`[MCP]   SAP_URL (hex): ${urlBytes}\n`);
        }
        // Check for invalid characters
        if (!/^https?:\/\//.test(sapUrl)) {
          process.stderr.write(`[MCP]   ⚠ WARNING: SAP_URL does not start with http:// or https://\n`);
        }
        // Check for control characters
        if (/[\x00-\x1F\x7F]/.test(sapUrl)) {
          process.stderr.write(`[MCP]   ⚠ WARNING: SAP_URL contains control characters\n`);
        }
      } else {
        process.stderr.write(`[MCP]   SAP_URL: (not set)\n`);
      }

      if (sapClient) {
        process.stderr.write(`[MCP]   SAP_CLIENT: ${sapClient}\n`);
      } else {
        process.stderr.write(`[MCP]   SAP_CLIENT: (not set)\n`);
      }

      if (sapAuthType) {
        process.stderr.write(`[MCP]   SAP_AUTH_TYPE: ${sapAuthType}\n`);
      } else {
        process.stderr.write(`[MCP]   SAP_AUTH_TYPE: (not set, will default to basic)\n`);
      }

      if (sapUsername) {
        process.stderr.write(`[MCP]   SAP_USERNAME: ${sapUsername.substring(0, 10)}... (length: ${sapUsername.length})\n`);
      } else {
        process.stderr.write(`[MCP]   SAP_USERNAME: (not set)\n`);
      }

      if (sapPassword) {
        process.stderr.write(`[MCP]   SAP_PASSWORD: *** (length: ${sapPassword.length})\n`);
      } else {
        process.stderr.write(`[MCP]   SAP_PASSWORD: (not set)\n`);
      }

      if (sapJwtToken) {
        const tokenPreview = sapJwtToken.length > 30 ? sapJwtToken.substring(0, 30) + '...' : sapJwtToken;
        process.stderr.write(`[MCP]   SAP_JWT_TOKEN: ${tokenPreview} (length: ${sapJwtToken.length})\n`);
      } else {
        process.stderr.write(`[MCP]   SAP_JWT_TOKEN: (not set)\n`);
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
  // Write to debug log immediately at start (to verify launcher is running)
  const initialLogPath = path.resolve(process.cwd(), 'mcp-launcher-debug.log');
  try {
    const startInfo = [
      `[MCP] ========================================`,
      `[MCP] Launcher STARTED at: ${new Date().toISOString()}`,
      `[MCP] Platform: ${process.platform}`,
      `[MCP] Node version: ${process.version}`,
      `[MCP] Working directory: ${process.cwd()}`,
      `[MCP] Process PID: ${process.pid}`,
      `[MCP] Command line args: ${process.argv.join(' ')}`,
      `[MCP] ========================================`,
      ``
    ];
    fs.writeFileSync(initialLogPath, startInfo.join('\n') + '\n', { encoding: 'utf8', flag: 'w' });
  } catch (startError) {
    // If we can't write at start, try temp directory
    try {
      const os = require('os');
      const altPath = path.join(os.tmpdir(), 'mcp-launcher-debug.log');
      fs.writeFileSync(altPath, `[MCP] Failed to write to ${initialLogPath}: ${startError.message}\n`, { encoding: 'utf8', flag: 'w' });
    } catch (altError) {
      // Give up on file, but continue
    }
  }

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
  // Default is HTTP mode, stdio only if explicitly specified
  const isStdio = args.transport === 'stdio';
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

  // Output launch parameters for debugging
  // Always write to file for debugging (especially for Cline which doesn't show stderr)
  // Use absolute path to avoid issues on Windows
  const cwd = process.cwd();
  const debugLogPath = path.resolve(cwd, 'mcp-launcher-debug.log');
  const debugInfo = [];

  // Add timestamp and basic info first
  debugInfo.push(`[MCP] ========================================`);
  debugInfo.push(`[MCP] Launcher started at: ${new Date().toISOString()}`);
  debugInfo.push(`[MCP] Platform: ${process.platform}`);
  debugInfo.push(`[MCP] Node version: ${process.version}`);
  debugInfo.push(`[MCP] Working directory: ${cwd}`);
  debugInfo.push(`[MCP] Debug log path: ${debugLogPath}`);
  debugInfo.push(`[MCP] ========================================`);
  debugInfo.push('');

  debugInfo.push(`[MCP] Launch parameters:`);
  debugInfo.push(`[MCP]   Transport: ${args.transport || 'http (default)'}`);
  if (args.envFile) {
    debugInfo.push(`[MCP]   .env file: ${args.envFile}`);
  } else {
    debugInfo.push(`[MCP]   .env file: (auto-detected from current directory)`);
  }
  debugInfo.push(`[MCP]   Working directory: ${process.cwd()}`);
  debugInfo.push(`[MCP]   Platform: ${process.platform}`);
  debugInfo.push(`[MCP]   Node version: ${process.version}`);

  if (process.env.SAP_URL) {
    debugInfo.push(`[MCP]   SAP_URL: ${process.env.SAP_URL} (length: ${process.env.SAP_URL.length})`);
    const urlBytes = Buffer.from(process.env.SAP_URL, 'utf8').toString('hex');
    if (urlBytes.length > 120) {
      debugInfo.push(`[MCP]   SAP_URL (hex): ${urlBytes.substring(0, 120)}...`);
    } else {
      debugInfo.push(`[MCP]   SAP_URL (hex): ${urlBytes}`);
    }
  } else {
    debugInfo.push(`[MCP]   SAP_URL: (not set)`);
  }

  if (process.env.SAP_CLIENT) {
    debugInfo.push(`[MCP]   SAP_CLIENT: ${process.env.SAP_CLIENT}`);
  } else {
    debugInfo.push(`[MCP]   SAP_CLIENT: (not set)`);
  }

  if (process.env.SAP_AUTH_TYPE) {
    debugInfo.push(`[MCP]   SAP_AUTH_TYPE: ${process.env.SAP_AUTH_TYPE}`);
  } else {
    debugInfo.push(`[MCP]   SAP_AUTH_TYPE: (not set, default: basic)`);
  }

  if (process.env.SAP_USERNAME) {
    debugInfo.push(`[MCP]   SAP_USERNAME: ${process.env.SAP_USERNAME.substring(0, 10)}... (length: ${process.env.SAP_USERNAME.length})`);
  } else {
    debugInfo.push(`[MCP]   SAP_USERNAME: (not set)`);
  }

  if (process.env.SAP_PASSWORD) {
    debugInfo.push(`[MCP]   SAP_PASSWORD: *** (length: ${process.env.SAP_PASSWORD.length})`);
  } else {
    debugInfo.push(`[MCP]   SAP_PASSWORD: (not set)`);
  }

  debugInfo.push(`[MCP] Starting server...`);
  debugInfo.push('');

  // Write to file (always, even in stdio mode)
  // Try to write immediately to catch any errors
  try {
    // Ensure directory exists
    const logDir = path.dirname(debugLogPath);
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
      } catch (mkdirError) {
        throw new Error(`Failed to create log directory: ${mkdirError instanceof Error ? mkdirError.message : String(mkdirError)}`);
      }
    }

    // Check if we can write to the directory
    try {
      const testFile = path.join(logDir, '.mcp-test-write');
      fs.writeFileSync(testFile, 'test', { encoding: 'utf8', flag: 'w' });
      fs.unlinkSync(testFile);
    } catch (testError) {
      throw new Error(`Cannot write to directory ${logDir}: ${testError instanceof Error ? testError.message : String(testError)}`);
    }

    // Write to file with error handling
    const logContent = debugInfo.join('\n') + '\n';
    fs.writeFileSync(debugLogPath, logContent, { encoding: 'utf8', flag: 'w' });

    // Verify file was written
    if (!fs.existsSync(debugLogPath)) {
      throw new Error(`File was not created: ${debugLogPath}`);
    }

    const stats = fs.statSync(debugLogPath);
    if (stats.size === 0) {
      throw new Error(`File is empty after write: ${debugLogPath}`);
    }

    // Also write to stderr for non-stdio modes
    const isStdioMode = args.transport === 'stdio' || (!args.transport && !process.stdin.isTTY);
    if (!isStdioMode) {
      process.stderr.write(debugInfo.join('\n') + '\n');
    } else {
      // For stdio mode, at least write to file and notify
      try {
        process.stderr.write(`[MCP] Debug info written to: ${debugLogPath} (${stats.size} bytes)\n`);
      } catch (stderrError) {
        // If stderr write fails, at least we have the file
      }
    }
  } catch (error) {
    // If file write fails, try to write error to stderr and also try alternative location
    const errorMsg = `[MCP] ✗ Failed to write debug log: ${error instanceof Error ? error.message : String(error)}\n`;
    const errorMsg2 = `[MCP]   Attempted path: ${debugLogPath}\n`;

    // Try alternative location (user's temp directory)
    let altLogPath = null;
    try {
      const os = require('os');
      altLogPath = path.join(os.tmpdir(), 'mcp-launcher-debug.log');
      fs.writeFileSync(altLogPath, debugInfo.join('\n') + '\n' + errorMsg + errorMsg2, { encoding: 'utf8', flag: 'w' });
      const altErrorMsg = `[MCP]   Alternative log written to: ${altLogPath}\n`;
      try {
        process.stderr.write(errorMsg);
        process.stderr.write(errorMsg2);
        process.stderr.write(altErrorMsg);
        process.stderr.write(debugInfo.join('\n') + '\n');
      } catch (stderrError) {
        console.error(errorMsg);
        console.error(errorMsg2);
        console.error(altErrorMsg);
        console.error(debugInfo.join('\n'));
      }
    } catch (altError) {
      // If even alternative fails, just try console.error
      try {
        process.stderr.write(errorMsg);
        process.stderr.write(errorMsg2);
        process.stderr.write(debugInfo.join('\n') + '\n');
      } catch (stderrError) {
        console.error(errorMsg);
        console.error(errorMsg2);
        console.error(debugInfo.join('\n'));
      }
    }
  }

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
