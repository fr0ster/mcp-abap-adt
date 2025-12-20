#!/usr/bin/env node

/**
 * MCP ABAP ADT Server Launcher (v1)
 *
 * Simple launcher that runs the compiled server from dist/server/v1/index.js
 *
 * NOTE: Using direct require() instead of spawn() to ensure proper stdio handling.
 * spawn() with stdio: 'inherit' can cause issues with MCP protocol
 * because the parent process becomes an unnecessary intermediate layer.
 */

// Just require the server entry point directly - this runs the server in the same process
// with proper stdin/stdout handling for MCP protocol
require('../dist/server/v1/index.js');
