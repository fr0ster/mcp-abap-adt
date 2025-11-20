#!/usr/bin/env node

/**
 * MCP ABAP ADT Server - SSE (Server-Sent Events) transport
 *
 * Usage:
 *   mcp-abap-adt-sse [options]
 *   mcp-abap-adt-sse --port 3000
 *   mcp-abap-adt-sse --host 0.0.0.0 --port 8080
 *
 * Environment variables:
 *   MCP_SSE_PORT - Server port (default: 3000)
 *   MCP_SSE_HOST - Server host (default: localhost)
 */

// Set default transport to sse
process.argv.push('--transport', 'sse');

require('../dist/index.js');
