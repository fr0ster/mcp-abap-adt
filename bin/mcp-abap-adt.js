#!/usr/bin/env node

/**
 * MCP ABAP ADT Server Launcher
 *
 * Main entry point that runs the v2 server from dist/server/v2/launcher.js
 *
 * NOTE: Using direct require() instead of spawn() to ensure proper stdio handling.
 * spawn() with stdio: 'inherit' can cause issues with MCP protocol
 * because the parent process becomes an unnecessary intermediate layer.
 */

// Just require the server entry point directly - this runs the server in the same process
// with proper stdin/stdout handling for MCP protocol
require('../dist/server/launcher.js');
