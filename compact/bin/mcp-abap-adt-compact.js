#!/usr/bin/env node

/**
 * MCP ABAP ADT — the compact command over stdio.
 *
 * Starts the server in THIS process so stdin/stdout stay wired to the MCP protocol
 * with no intermediate layer, exactly as `mcp-abap-adt` does: core's `main` with the
 * compact tool set — 27 tools with `rw`, the 16 that change nothing with `ro`, and
 * four debug verbs beside either with `debug`.
 */
const { main } = require('../dist/launcher.js');
const { launcherFailedLine } = require('@mcp-abap-adt/core/launcher');

void main().catch((err) => {
  console.error(launcherFailedLine(err));
  process.exit(1);
});
