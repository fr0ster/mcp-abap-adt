#!/usr/bin/env node

/**
 * mcp-abap-adt-compact-sse — the compact MCP ABAP ADT server over HTTP+SSE.
 *
 * `@mcp-abap-adt/server-runtime/sse`'s launcher with the compact tool set, started in this
 * process.
 */
const { main } = require('../dist/launcher.js');

void main().catch(() => {
  // Fixed words: an error's message may quote a file or a header.
  console.error('[MCP] launcher failed');
  process.exit(1);
});
