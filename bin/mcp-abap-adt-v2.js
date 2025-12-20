#!/usr/bin/env node

/**
 * MCP ABAP ADT Server Launcher (v2)
 *
 * Runs the new server stack (stdio | sse | http) based on --transport flag.
 * Defaults to stdio.
 *
 * NOTE: Using direct require() instead of spawn() to ensure proper stdio handling.
 * spawn() with stdio: 'inherit' can cause issues with MCP protocol
 * because the parent process becomes an unnecessary intermediate layer.
 */

// Just require the launcher entry point directly - this runs the server in the same process
// with proper stdin/stdout handling for MCP protocol
require('../dist/server/v2/launcher.js');
