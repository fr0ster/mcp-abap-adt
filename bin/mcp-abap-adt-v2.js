#!/usr/bin/env node

/**
 * MCP ABAP ADT Server v2 Launcher
 *
 * Simple launcher that runs the compiled v2 server from dist/bin/
 * and passes through all command line arguments
 */

const { spawn } = require('child_process');
const path = require('path');

// Path to compiled v2 server
const serverPath = path.resolve(__dirname, '../dist/bin/mcp-abap-adt-v2.js');

// Get all command line arguments (skip node and script name)
const args = process.argv.slice(2);

// Spawn the compiled server with all arguments
const child = spawn(process.execPath, [serverPath, ...args], {
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
