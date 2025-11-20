#!/usr/bin/env node

/**
 * MCP ABAP ADT Server - StreamableHTTP transport
 *
 * Usage:
 *   mcp-abap-adt-http [options]
 *   mcp-abap-adt-http --port 3000
 *   mcp-abap-adt-http --host 0.0.0.0 --port 8080
 *
 * Environment variables:
 *   MCP_HTTP_PORT - Server port (default: 3000)
 *   MCP_HTTP_HOST - Server host (default: localhost)
 */

// Set default transport to streamable-http
process.argv.push('--transport', 'streamable-http');

require('../dist/index.js');
