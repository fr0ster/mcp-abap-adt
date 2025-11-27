# Architecture Documentation

This directory contains technical documentation about the system architecture, design decisions, and internal structure.

## Files

- **[STATEFUL_SESSION_GUIDE.md](STATEFUL_SESSION_GUIDE.md)** - Comprehensive guide on stateful session management in SAP ADT API, covering server/handler workflow for lock/update/unlock operations
- **[TOOLS_ARCHITECTURE.md](TOOLS_ARCHITECTURE.md)** - MCP tools architecture and handler structure, explaining how tools are organized and how `TOOL_DEFINITION` works
- **[CONNECTION_ISOLATION.md](CONNECTION_ISOLATION.md)** - Connection isolation architecture, explaining how per-session connection isolation prevents data mixing between clients (version 1.1.10+)

## Related Documentation

For related guides from different perspectives, see the documentation in the respective npm packages:

- `@mcp-abap-adt/adt-clients` - Builder & LockClient perspective
- `@mcp-abap-adt/connection` - Connection layer perspective
