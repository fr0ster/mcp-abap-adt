#!/usr/bin/env node

/**
 * mcp-abap-adt-sse — the MCP ABAP ADT server over HTTP+SSE.
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
