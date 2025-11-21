#!/usr/bin/env node

/**
 * MCP ABAP ADT Server - Default (stdio) transport
 *
 * Usage:
 *   mcp-abap-adt [options]
 *
 * This is the default stdio transport for MCP protocol.
 * For other transports, use specific commands:
 *   - mcp-abap-adt-http (StreamableHTTP)
 *   - mcp-abap-adt-sse (Server-Sent Events)
 */

require('../dist/index.js');
