#!/usr/bin/env node

/**
 * MCP ABAP ADT Server v2 Launcher
 *
 * Entry point for v2 server architecture
 */

const path = require('path');
const { spawn } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);

// Find transport argument
const transportArg = args.find((arg) => arg.startsWith('--transport='));
const transport = transportArg ? transportArg.split('=')[1] : 'stdio';

// Find --mcp argument
const mcpArg = args.find((arg) => arg.startsWith('--mcp='));
const destination = mcpArg ? mcpArg.split('=')[1] : undefined;

// Entry point for v2 server
const entryPath = path.resolve(__dirname, '../dist/tools/test-v2-server-stdio-compiled.js');

// For now, only stdio is supported via this entry point
// SSE and HTTP should use dev-v2-sse.js and dev-v2-http.js scripts
if (transport !== 'stdio') {
  console.error(`Error: Transport '${transport}' not supported via this entry point.`);
  console.error('Use dev-v2-sse.js for SSE or dev-v2-http.js for HTTP transport.');
  process.exit(1);
}

if (!destination) {
  console.error('Error: --mcp=destination parameter is required');
  console.error('Usage: node bin/mcp-abap-adt-v2.js --mcp=my-destination [--transport=stdio]');
  process.exit(1);
}

// Spawn the server
const child = spawn(process.execPath, [entryPath, ...args], {
  stdio: 'inherit',
  env: process.env,
  cwd: process.cwd(),
  shell: false,
});

child.on('error', (error) => {
  console.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  process.exit(code ?? 0);
});
