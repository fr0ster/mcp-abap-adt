#!/usr/bin/env node

/**
 * MCP ABAP ADT — the compact command.
 *
 * Starts the server in THIS process so stdin/stdout stay wired to the MCP protocol
 * with no intermediate layer, exactly as `mcp-abap-adt` does. The tool list is the
 * compact facade's 22 tools and nothing else.
 */
const { main } = require('../dist/launcher.js');

void main().catch((err) => {
  console.error(
    '[MCP] compact launcher failed:',
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
