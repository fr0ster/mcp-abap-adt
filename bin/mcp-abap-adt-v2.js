#!/usr/bin/env node

/**
 * MCP ABAP ADT Server Launcher (v2)
 *
 * Runs the new server stack (stdio | sse | http) based on --transport flag.
 * Defaults to stdio.
 */

const { spawn } = require('child_process');
const path = require('path');

// Path to compiled launcher (v2)
const launcherPath = path.resolve(__dirname, '../dist/server/v2/launcher.js');

// Passthrough args
const args = process.argv.slice(2);

const child = spawn(process.execPath, [launcherPath, ...args], {
  stdio: 'inherit',
  env: process.env,
  cwd: process.cwd(),
  shell: false,
});

child.on('error', (error) => {
  console.error(`[mcp-abap-adt-v2] Failed to start: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  process.exit(code ?? 0);
});
