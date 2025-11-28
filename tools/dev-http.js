#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const children = new Set();

const args = process.argv.slice(2);

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
    process.stderr.write('[dev-http] dist/index.js not found. Please run "npm run build" first.\n');
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
  const serverArgs = [entryPath, '--transport', 'streamable-http', ...cliArgs];
  const serverEnv = { ...process.env };
  if (!serverEnv.DEBUG) {
    serverEnv.DEBUG = 'true';
  }

  // On Windows, ensure proper error handling
  if (process.platform === 'win32') {
    process.stderr.write(`[dev-http] Starting server: ${process.execPath} ${serverArgs.join(' ')}\n`);
    process.stderr.write(`[dev-http] Working directory: ${process.cwd()}\n`);
    process.stderr.write(`[dev-http] .env file: ${require('path').resolve(process.cwd(), '.env')}\n`);
  }

  const child = spawn(process.execPath, serverArgs, {
    stdio: 'inherit',
    env: serverEnv,
    cwd: process.cwd(),
  });

  registerChild(child);

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

  const child = spawn(inspectorCmd, args, {
    stdio: 'inherit',
    env: process.env,
  });

  registerChild(child);

  child.on('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      const reason = code !== null ? `code ${code}` : `signal ${signal}`;
      process.stderr.write(`[dev-http] MCP Inspector exited (${reason}).\n`);
    }
  });

  return child;
}

(function main() {
  const entryPath = path.resolve(__dirname, '../dist/index.js');
  ensureDistExists(entryPath);

  const port = parseHttpPort(args);
  const server = spawnServer(entryPath, args);

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
