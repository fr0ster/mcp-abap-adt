#!/usr/bin/env node

/**
 * MCP ABAP ADT — the compact command over stdio.
 *
 * Starts the server in THIS process so stdin/stdout stay wired to the MCP protocol
 * with no intermediate layer, exactly as `mcp-abap-adt` does: the runtime's stdio `main`
 * (@mcp-abap-adt/server-runtime/stdio) with the compact tool set: the 27 compact tools, the four debugger tools, the leftover
 * sessions and background runs. The 16 that change nothing alone are
 * `mcp-abap-adt-compact-ro` (@mcp-abap-adt/compact-ro).
 */
const { main } = require('../dist/launcher.js');
const { launcherFailedLine } = require('@mcp-abap-adt/server-runtime/stdio');

void main().catch((err) => {
  console.error(launcherFailedLine(err));
  process.exit(1);
});
