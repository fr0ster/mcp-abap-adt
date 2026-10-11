#!/usr/bin/env node

/**
 * mcp-abap-adt-http — the MCP ABAP ADT server over Streamable HTTP.
 *
 * The launcher is required and started in this process; it starts nothing
 * on import, so a sibling command can import the same `main`.
 */
const { main } = require('../dist/launcher.js');

void main().catch(() => {
  // Fixed words: an error's message may quote a file or a header.
  console.error('[MCP] launcher failed');
  process.exit(1);
});
