#!/usr/bin/env node

/**
 * MCP ABAP ADT Server
 *
 * Usage:
 *   mcp-abap-adt [options]
 *
 * Transport modes:
 *   - Default: HTTP (can work without .env file)
 *   - stdio: --transport=stdio (for MCP clients like Cline/Cursor, requires .env)
 *   - SSE: --transport=sse
 *
 * Examples:
 *   mcp-abap-adt                                    # HTTP server (default)
 *   mcp-abap-adt --http-port=8080                   # HTTP server on custom port
 *   mcp-abap-adt --transport=stdio                  # stdio mode (for MCP clients)
 *   mcp-abap-adt --transport=sse --sse-port=3001   # SSE server
 *
 * Run with --help for complete options list.
 */

require('../dist/index.js');
