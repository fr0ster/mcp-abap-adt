#!/usr/bin/env node

/**
 * mcp-abap-adt-http-ro — the read-only MCP ABAP ADT server over Streamable HTTP.
 *
 * `@mcp-abap-adt/http`'s launcher with the read-only tool set, started in this
 * process.
 */
const { main } = require('../dist/launcher.js');

void main().catch(() => {
  // Fixed words: an error's message may quote a file or a header.
  console.error('[MCP] launcher failed');
  process.exit(1);
});
