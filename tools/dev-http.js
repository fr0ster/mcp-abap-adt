#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const children = new Set();

const args = process.argv.slice(2);

// Debug: log received arguments (especially important on Windows)
if (process.platform === 'win32') {
  process.stderr.write(`[dev-http] Received arguments: ${JSON.stringify(args)}\n`);
  process.stderr.write(`[dev-http] Full process.argv: ${JSON.stringify(process.argv)}\n`);
}

// Normalize arguments: handle cases where npm passes arguments incorrectly
// When running: npm run dev:http -- --env .\mdd.env
// npm might pass: .\mdd.env (without --env prefix)
// We need to detect this and add --env prefix
const normalizedArgs = [];
let i = 0;
while (i < args.length) {
  const arg = args[i];

  // If we see --env, keep it and the next argument
  if (arg === '--env' || arg.startsWith('--env=')) {
    if (arg.startsWith('--env=')) {
      // Format: --env=path
      normalizedArgs.push(arg);
      i++;
    } else {
      // Format: --env path
      normalizedArgs.push(arg);
      i++;
      if (i < args.length) {
        normalizedArgs.push(args[i]);
        i++;
      }
    }
  } else if (!arg.startsWith('--') && (arg.includes('.env') || arg.endsWith('.env'))) {
    // If argument looks like an .env file path and doesn't start with --,
    // treat it as --env argument value
    normalizedArgs.push('--env', arg);
    i++;
  } else {
    // Regular argument, pass through
    normalizedArgs.push(arg);
    i++;
  }
}

// Debug: log normalized arguments
if (process.platform === 'win32') {
  if (normalizedArgs.length !== args.length || JSON.stringify(normalizedArgs) !== JSON.stringify(args)) {
    process.stderr.write(`[dev-http] Normalized arguments: ${JSON.stringify(normalizedArgs)}\n`);
  }
}

function parseHttpPort(cliArgs) {
  let port;
  for (let i = 0; i < cliArgs.length; i += 1) {
    const current = cliArgs[i];
    if (current.startsWith('--http-port=')) {
      const value = current.split('=')[1];
      if (value) {
        port = parseInt(value, 10);
      }
    } else if (current === '--http-port' && i + 1 < cliArgs.length) {
      port = parseInt(cliArgs[i + 1], 10);
    }
  }
  if (Number.isInteger(port) && port > 0 && port <= 65535) {
    return port;
  }
  return 3000;
}

function ensureDistExists(entryPath) {
  if (!fs.existsSync(entryPath)) {
    process.stderr.write('[dev-http] dist/server/v1/index.js not found. Please run "npm run build" first.\n');
    process.exit(1);
  }
}

function registerChild(child) {
  if (!child) {
    return;
  }
  children.add(child);
  child.on('exit', () => {
    children.delete(child);
  });
}

function spawnServer(entryPath, cliArgs) {
  // Build server arguments: entry path, transport, and all passed arguments
  const serverArgs = [entryPath, '--transport', 'streamable-http', ...cliArgs];
  const serverEnv = { ...process.env };
  if (!serverEnv.DEBUG) {
    serverEnv.DEBUG = 'true';
  }

  // On Windows, ensure proper error handling (don't log args to avoid exposing credentials)
  if (process.platform === 'win32') {
    process.stderr.write(`[dev-http] Starting server\n`);
    process.stderr.write(`[dev-http] Working directory: ${process.cwd()}\n`);
    process.stderr.write(`[dev-http] CLI args received: ${JSON.stringify(cliArgs)}\n`);
    process.stderr.write(`[dev-http] Server args to spawn: ${JSON.stringify(serverArgs)}\n`);

    // Find --env argument
    let envFile = null;
    const envArgIndex = cliArgs.findIndex(arg => arg === '--env' || arg.startsWith('--env='));
    if (envArgIndex !== -1) {
      const envArg = cliArgs[envArgIndex];
      if (envArg.startsWith('--env=')) {
        envFile = envArg.slice('--env='.length);
      } else if (envArgIndex + 1 < cliArgs.length) {
        envFile = cliArgs[envArgIndex + 1];
      }
    }

    if (envFile) {
      const resolvedEnvFile = require('path').isAbsolute(envFile)
        ? envFile
        : require('path').resolve(process.cwd(), envFile);
      process.stderr.write(`[dev-http] Detected .env file from --env arg: ${resolvedEnvFile}\n`);
    } else {
      const defaultEnvFile = require('path').resolve(process.cwd(), '.env');
      process.stderr.write(`[dev-http] No --env arg found, will use default: ${defaultEnvFile}\n`);
    }
  }

  // Use process.execPath to avoid path resolution issues on Windows
  // Debug: log what we're about to spawn
  if (process.platform === 'win32') {
    process.stderr.write(`[dev-http] About to spawn: ${process.execPath}\n`);
    process.stderr.write(`[dev-http] With args: ${JSON.stringify(serverArgs)}\n`);
    process.stderr.write(`[dev-http] Args count: ${serverArgs.length}\n`);
  }

  const child = spawn(process.execPath, serverArgs, {
    stdio: 'inherit',
    env: serverEnv,
    cwd: process.cwd(),
    shell: false, // Explicitly set shell to false
  });

  registerChild(child);

  // Handle spawn errors (especially important on Windows)
  child.on('error', (error) => {
    process.stderr.write(`[dev-http] ✗ Failed to spawn server: ${error.message}\n`);
    if (error.code === 'EINVAL') {
      process.stderr.write(`[dev-http] EINVAL error - check paths and arguments\n`);
      process.stderr.write(`[dev-http] Entry path: ${entryPath}\n`);
      process.stderr.write(`[dev-http] Node exec path: ${process.execPath}\n`);
    }
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    const reason = code !== null ? `code ${code}` : `signal ${signal}`;
    process.stderr.write(`[dev-http] HTTP server exited (${reason}).\n`);
    process.exit(code ?? 0);
  });

  return child;
}

function spawnInspector(port) {
  const inspectorCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = [
    '@modelcontextprotocol/inspector',
    '--transport',
    'http',
    '--server-url',
    `http://localhost:${port}`,
  ];

  // On Windows, .cmd files require shell: true for proper execution
  const spawnOptions = {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
    ...(process.platform === 'win32' ? { shell: true } : {}),
  };

  const child = spawn(inspectorCmd, args, spawnOptions);

  registerChild(child);

  // Handle spawn errors (especially important on Windows)
  child.on('error', (error) => {
    process.stderr.write(`[dev-http] ✗ Failed to spawn inspector: ${error.message}\n`);
    if (error.code === 'EINVAL') {
      process.stderr.write(`[dev-http] EINVAL error - check npx installation and PATH\n`);
      process.stderr.write(`[dev-http] Inspector command: ${inspectorCmd}\n`);
    }
  });

  child.on('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      const reason = code !== null ? `code ${code}` : `signal ${signal}`;
      process.stderr.write(`[dev-http] MCP Inspector exited (${reason}).\n`);
    }
  });

  return child;
}

(function main() {
  const entryPath = path.resolve(__dirname, '../dist/server/v1/index.js');
  ensureDistExists(entryPath);

  const port = parseHttpPort(normalizedArgs);
  const server = spawnServer(entryPath, normalizedArgs);

  const inspectorDelay = parseInt(process.env.MCP_DEV_HTTP_INSPECTOR_DELAY || '1200', 10);
  let inspector;

  setTimeout(() => {
    if (server.killed) {
      return;
    }
    inspector = spawnInspector(port);
  }, Number.isNaN(inspectorDelay) ? 1200 : inspectorDelay);

  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, () => {
      for (const child of children) {
        if (!child.killed) {
          child.kill(signal);
        }
      }
      process.exit(0);
    });
  }
})();
