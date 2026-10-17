#!/usr/bin/env node

/**
 * mcp-abap-adt-compact-ro — the read-only compact MCP ABAP ADT server over stdio.
 *
 * Starts the server in THIS process so stdin/stdout stay wired to the MCP protocol
 * with no intermediate layer, exactly as `mcp-abap-adt` does: core's `main` with
 * the read-only tool set — the 16 compact tools that change nothing and the leftover-session list and logoff.
 */
const { main } = require('../dist/launcher.js');
const { launcherFailedLine } = require('@mcp-abap-adt/core/launcher');

void main().catch((err) => {
  console.error(launcherFailedLine(err));
  process.exit(1);
});
