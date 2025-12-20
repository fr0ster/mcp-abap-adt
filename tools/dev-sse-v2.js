#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const children = new Set();
const args = process.argv.slice(2);

function parsePort(cliArgs) {
  let port;
  for (let i = 0; i < cliArgs.length; i += 1) {
    const current = cliArgs[i];
    if (current.startsWith('--port=')) {
      port = parseInt(current.split('=')[1], 10);
    } else if (current === '--port' && i + 1 < cliArgs.length) {
      port = parseInt(cliArgs[i + 1], 10);
    }
  }
  if (Number.isInteger(port) && port > 0 && port <= 65535) {
    return port;
  }
  return 3001;
}

function ensureDistExists(entryPath) {
  if (!fs.existsSync(entryPath)) {
    process.stderr.write('[dev-sse-v2] dist/server/v2/launcher.js not found. Run "npm run build" first.\n');
    process.exit(1);
  }
}

function registerChild(child) {
  if (!child) return;
  children.add(child);
  child.on('exit', () => children.delete(child));
}

function spawnServer(entryPath, cliArgs) {
  const serverArgs = [entryPath, '--transport', 'sse', ...cliArgs];
  const child = spawn(process.execPath, serverArgs, {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: process.cwd(),
    shell: false,
  });
  registerChild(child);
  child.on('exit', (code, signal) => {
    const reason = code !== null ? `code ${code}` : `signal ${signal}`;
    process.stderr.write(`[dev-sse-v2] SSE server exited (${reason}).\n`);
    process.exit(code ?? 0);
  });
  return child;
}

function spawnInspector(port) {
  const inspectorCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = [
    '@modelcontextprotocol/inspector',
    '--transport',
    'sse',
    '--server-url',
    `http://localhost:${port}/sse`,
  ];
  const opts = {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
    ...(process.platform === 'win32' ? { shell: true } : {}),
  };
  const child = spawn(inspectorCmd, args, opts);
  registerChild(child);
  return child;
}

(function main() {
  const entryPath = path.resolve(__dirname, '../dist/server/v2/launcher.js');
  ensureDistExists(entryPath);

  const port = parsePort(args);
  const server = spawnServer(entryPath, args);

  const delay = parseInt(process.env.MCP_DEV_SSE_V2_INSPECTOR_DELAY || '1200', 10);
  setTimeout(() => {
    if (!server.killed) {
      spawnInspector(port);
    }
  }, Number.isNaN(delay) ? 1200 : delay);

  const signals = ['SIGINT', 'SIGTERM'];
  for (const sig of signals) {
    process.on(sig, () => {
      for (const child of children) {
        if (!child.killed) child.kill(sig);
      }
      process.exit(0);
    });
  }
})();

