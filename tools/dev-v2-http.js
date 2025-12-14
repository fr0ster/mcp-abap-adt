#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const children = new Set();

const args = process.argv.slice(2);

// Normalize arguments: handle cases where npm passes arguments incorrectly
const normalizedArgs = [];
let i = 0;
while (i < args.length) {
  const arg = args[i];

  // If we see --env, keep it and the next argument
  if (arg === '--env' || arg.startsWith('--env=')) {
    if (arg.startsWith('--env=')) {
      normalizedArgs.push(arg);
      i++;
    } else {
      normalizedArgs.push(arg);
      i++;
      if (i < args.length) {
        normalizedArgs.push(args[i]);
        i++;
      }
    }
  } else if (!arg.startsWith('--') && (arg.includes('.env') || arg.endsWith('.env'))) {
    normalizedArgs.push('--env', arg);
    i++;
  } else {
    normalizedArgs.push(arg);
    i++;
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

function parseHttpHost(cliArgs) {
  let host;
  for (let i = 0; i < cliArgs.length; i += 1) {
    const current = cliArgs[i];
    if (current.startsWith('--host=')) {
      host = current.split('=')[1];
    } else if (current === '--host' && i + 1 < cliArgs.length) {
      host = cliArgs[i + 1];
    }
  }
  // Default to 127.0.0.1 (LOCAL mode)
  return host || '127.0.0.1';
}

function ensureDistExists(entryPath) {
  if (!fs.existsSync(entryPath)) {
    process.stderr.write('[dev-v2-http] tools/test-v2-server-http-compiled.js not found.\n');
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
  const serverArgs = [entryPath, ...cliArgs];
  const serverEnv = { ...process.env };
  if (!serverEnv.DEBUG) {
    serverEnv.DEBUG = 'true';
  }

  const child = spawn(process.execPath, serverArgs, {
    stdio: 'inherit',
    env: serverEnv,
    cwd: process.cwd(),
    shell: false,
  });

  registerChild(child);

  child.on('error', (error) => {
    process.stderr.write(`[dev-v2-http] ✗ Failed to spawn server: ${error.message}\n`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    const reason = code !== null ? `code ${code}` : `signal ${signal}`;
    process.stderr.write(`[dev-v2-http] HTTP server exited (${reason}).\n`);
    process.exit(code ?? 0);
  });

  return child;
}

function spawnInspector(port, host) {
  const inspectorCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  // Use localhost for inspector URL regardless of server host
  const inspectorUrl = `http://localhost:${port}`;
  const args = [
    '@modelcontextprotocol/inspector',
    '--transport',
    'http',
    '--server-url',
    inspectorUrl,
  ];

  const spawnOptions = {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
    ...(process.platform === 'win32' ? { shell: true } : {}),
  };

  const child = spawn(inspectorCmd, args, spawnOptions);

  registerChild(child);

  child.on('error', (error) => {
    process.stderr.write(`[dev-v2-http] ✗ Failed to spawn inspector: ${error.message}\n`);
  });

  child.on('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      const reason = code !== null ? `code ${code}` : `signal ${signal}`;
      process.stderr.write(`[dev-v2-http] MCP Inspector exited (${reason}).\n`);
    }
  });

  return child;
}

(function main() {
  const entryPath = path.resolve(__dirname, './test-v2-server-http-compiled.js');
  ensureDistExists(entryPath);

  const port = parseHttpPort(normalizedArgs);
  const host = parseHttpHost(normalizedArgs);
  const server = spawnServer(entryPath, normalizedArgs);

  const inspectorDelay = parseInt(process.env.MCP_DEV_V2_HTTP_INSPECTOR_DELAY || '1200', 10);
  let inspector;

  setTimeout(() => {
    if (server.killed) {
      return;
    }
    inspector = spawnInspector(port, host);
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
