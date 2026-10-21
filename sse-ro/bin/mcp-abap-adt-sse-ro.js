#!/usr/bin/env node

/**
 * mcp-abap-adt-sse-ro — the read-only MCP ABAP ADT server over HTTP+SSE.
 *
 * `@mcp-abap-adt/server-runtime/sse`'s launcher with the read-only tool set, started in this
 * process.
 */
const { main } = require('../dist/launcher.js');

void main().catch(() => {
  // Fixed words: an error's message may quote a file or a header.
  console.error('[MCP] launcher failed');
  process.exit(1);
});
