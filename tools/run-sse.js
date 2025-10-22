#!/usr/bin/env node
/**
 * Script for running MCP server in SSE mode
 *
 * Usage:
 *   node run-sse.js [--env path/to/.env] [--sse-port 3001] [--sse-host 127.0.0.1]
 *
 * All additional arguments are forwarded to the server process.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
let envPath = path.resolve(__dirname, '../.env');
const forwardArgs = [];

const hasTransportFlag = args.some((arg, index) => {
  if (arg === '--transport') {
    return true;
  }
  if (arg.startsWith('--transport=')) {
    return true;
  }
  if (arg === '--transport' && index + 1 < args.length) {
    return true;
  }
  return false;
});

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    console.log(`
Usage: node run-sse.js [options]

Options:
  --env PATH                      Path to environment file (.env)
  --sse-port PORT                 Port for the SSE server (default 3001)
  --sse-host HOST                 Host for the SSE server (default 0.0.0.0)
  --sse-allowed-origins LIST      Comma-separated list of allowed origins
  --sse-allowed-hosts LIST        Comma-separated list of allowed hosts
  --sse-enable-dns-protection     Enable DNS rebinding protection checks
  --help, -h                      Show this help message

Examples:
  node run-sse.js --sse-port 4100 --sse-host 127.0.0.1
  node run-sse.js --env ./dev.env --sse-enable-dns-protection
`);
    process.exit(0);
  }
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--env=')) {
    envPath = arg.slice('--env='.length);
  } else if (arg === '--env' && i + 1 < args.length) {
    envPath = args[i + 1];
    i++;
  } else if (arg === '--env') {
    console.error('Error: --env flag requires a value');
    process.exit(1);
  } else if (arg === '--help' || arg === '-h') {
    // already handled above
  } else {
    forwardArgs.push(arg);
  }
}

if (!path.isAbsolute(envPath)) {
  envPath = path.resolve(process.cwd(), envPath);
}

const serverPath = path.resolve(__dirname, '../dist/index.js');
if (!fs.existsSync(serverPath)) {
  console.error(`Error: Server not found at: ${serverPath}`);
  console.error(`Make sure to build the project with 'npm run build' first.`);
  process.exit(1);
}

const printBanner = (text) => {
  const line = '='.repeat(60);
  console.log('\n' + line);
  console.log(`  ${text}`);
  console.log(line + '\n');
};

printBanner('MCP ABAP ADT - SERVER (SSE MODE)');
console.log('Starting MCP server in SSE mode...');
console.log(`Server path: ${serverPath}`);
console.log(`Environment file: ${envPath}`);
console.log('Additional args:', hasTransportFlag ? forwardArgs.join(' ') : ['--transport sse', ...forwardArgs].join(' '));
console.log('');

const childArgs = [serverPath, `--env=${envPath}`];
if (!hasTransportFlag) {
  childArgs.push('--transport', 'sse');
}
childArgs.push(...forwardArgs);

const child = spawn('node', childArgs, {
  stdio: ['inherit', 'inherit', 'inherit']
});

child.on('close', (code) => {
  console.log(`\nMCP server exited with code: ${code}`);
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
  setTimeout(() => {
    process.exit(0);
  }, 500);
});

console.log('MCP server is running in SSE mode. Press Ctrl+C to exit.');
