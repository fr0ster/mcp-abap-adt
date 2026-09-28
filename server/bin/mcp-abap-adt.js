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

// Require the launcher and start it in THIS process, so stdin/stdout stay wired to
// the MCP protocol with no intermediate layer. `main()` is called explicitly
// because the launcher only self-starts when it is the program itself — a sibling
// command (@mcp-abap-adt/compact) imports the same `main` to serve a different tool
// list, and an import must not start a server.
const { main } = require('../dist/launcher.js');

void main().catch((err) => {
  console.error(
    '[MCP] launcher failed:',
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
