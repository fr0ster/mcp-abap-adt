# Architecture Documentation

This directory contains technical documentation about the system architecture, design decisions, and internal structure.

## Server Architecture (v1.2.0+)

The project has a modular architecture with two main usage patterns:

### Standalone Server (v2)
The default `mcp-abap-adt` command runs the v2 server with full transport support:
- **StdioServer** - Standard input/output for MCP clients
- **StreamableHttpServer** - HTTP transport with JSON responses
- **SseServer** - Server-Sent Events transport

### Handler Exporter (v1)
For embedding into existing servers (e.g., CAP/CDS applications):
```typescript
import { HandlerExporter } from '@fr0ster/mcp-abap-adt/handlers';

const exporter = new HandlerExporter({
  includeReadOnly: true,
  includeHighLevel: true,
  includeLowLevel: true,
  includeSystem: true,
  includeSearch: true,
});

exporter.registerOnServer(mcpServer, () => connection);
```

### Handler Groups
Handlers are organized into logical groups for flexible composition:
- **ReadOnlyHandlersGroup** - Read-only operations (getProgram, getClass, getTable, etc.)
- **HighLevelHandlersGroup** - High-level operations (create, update)
- **LowLevelHandlersGroup** - Low-level ADT operations
- **SystemHandlersGroup** - System operations (getInactiveObjects, etc.)
- **SearchHandlersGroup** - Search operations (whereUsed, quickFix)

## Files

- **[STATEFUL_SESSION_GUIDE.md](STATEFUL_SESSION_GUIDE.md)** - Stateful ADT request flow for lock/update/unlock operations
- **[TOOLS_ARCHITECTURE.md](TOOLS_ARCHITECTURE.md)** - MCP tools architecture and handler structure, explaining how tools are organized and how `TOOL_DEFINITION` works
- **[CONNECTION_ISOLATION.md](CONNECTION_ISOLATION.md)** - Connection isolation architecture, explaining how per-session connection isolation prevents data mixing between clients (version 1.1.10+)

## Related Documentation

For related guides from different perspectives, see the documentation in the respective npm packages:

- `@mcp-abap-adt/adt-clients` - Builder & LockClient perspective
- `@mcp-abap-adt/connection` - Connection layer perspective
