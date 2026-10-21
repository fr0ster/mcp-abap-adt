#!/usr/bin/env node

/**
 * mcp-abap-adt — the MCP ABAP ADT server over stdio, with the full tool set.
 *
 * NOTE: Using direct require() instead of spawn() to ensure proper stdio handling.
 * spawn() with stdio: 'inherit' can cause issues with MCP protocol
 * because the parent process becomes an unnecessary intermediate layer.
 *
 * The launcher is required and started in THIS process, so stdin/stdout stay
 * wired to the MCP protocol with no intermediate layer. It starts nothing on
 * import: `main` is called here with the tool set this command serves, and a
 * sibling command (@mcp-abap-adt/compact) calls the same `main` with its own.
 */
const { main, launcherFailedLine } = require('../dist/launcher.js');
const { CORE_VERSION } = require('../dist/coreVersion.js');
const { fullToolSet } = require('@mcp-abap-adt/lib/tool-set');

void main({
  toolSet: fullToolSet,
  program: 'mcp-abap-adt',
  version: CORE_VERSION,
}).catch((err) => {
  console.error(launcherFailedLine(err));
  process.exit(1);
});
