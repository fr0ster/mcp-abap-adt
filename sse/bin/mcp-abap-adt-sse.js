#!/usr/bin/env node

/**
 * mcp-abap-adt-sse — the MCP ABAP ADT server over HTTP+SSE, with the full tool set.
 *
 * The launcher is required and started in this process; it starts nothing
 * on import: `main` is called here with the tool set this command serves,
 * and a sibling command (@mcp-abap-adt/compact-sse) calls the same `main`
 * with its own.
 */
const { main } = require('../dist/launcher.js');
const { SSE_VERSION } = require('../dist/sseVersion.js');
const { fullToolSet } = require('@mcp-abap-adt/lib/tool-set');

void main({
  toolSet: fullToolSet,
  program: 'mcp-abap-adt-sse',
  version: SSE_VERSION,
}).catch(() => {
  // Fixed words: an error's message may quote a file or a header.
  console.error('[MCP] launcher failed');
  process.exit(1);
});
