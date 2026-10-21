#!/usr/bin/env node

/**
 * mcp-abap-adt-http — the MCP ABAP ADT server over Streamable HTTP, with the full tool set.
 *
 * The launcher is required and started in this process; it starts nothing
 * on import: `main` is called here with the tool set this command serves,
 * and a sibling command (@mcp-abap-adt/compact-http) calls the same `main`
 * with its own. The launcher is @mcp-abap-adt/server-runtime's; the version
 * is http's own.
 */
const { main } = require('@mcp-abap-adt/server-runtime/http');
const { HTTP_VERSION } = require('../dist/httpVersion.js');
const { fullToolSet } = require('@mcp-abap-adt/lib/tool-set');

void main({
  toolSet: fullToolSet,
  program: 'mcp-abap-adt-http',
  version: HTTP_VERSION,
}).catch(() => {
  // Fixed words: an error's message may quote a file or a header.
  console.error('[MCP] launcher failed');
  process.exit(1);
});
