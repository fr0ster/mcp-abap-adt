# Architecture Documentation

Technical documentation about the system architecture, design decisions, and internal structure.

## Packages

The repository holds five npm packages (not npm workspaces; each is built and published by path):

| Directory | Package | Role |
|---|---|---|
| `src/` (root) | `@mcp-abap-adt/lib` | Handlers, handler groups, configuration, auth, connection factory — everything an embedding server needs |
| `server/` | `@mcp-abap-adt/core` | The `mcp-abap-adt` command: launcher and transports |
| `compact-readonly/`, `compact-modify/` | `@mcp-abap-adt/compact-readonly`, `@mcp-abap-adt/compact-modify` | The two halves of the compact tool set |
| `compact/` | `@mcp-abap-adt/compact` | The `mcp-abap-adt-compact` command: core's launcher with the compact tool list |

### Standalone server

`mcp-abap-adt` (`server/src/launcher.ts`) serves three transports:
- **StdioServer** — standard input/output for MCP clients (default)
- **StreamableHttpServer** — `--transport=http`
- **SseServer** — `--transport=sse`

### Embedding the handlers

For embedding into an existing server (e.g. a CAP/CDS application):

```typescript
import { EmbeddableMcpServer } from '@mcp-abap-adt/lib/embeddable';
import { HandlerExporter } from '@mcp-abap-adt/lib/handlers';

const exporter = new HandlerExporter({
  includeReadOnly: true,
  includeHighLevel: true,
  includeLowLevel: false,
  includeSystem: true,
  includeSearch: true,
});

const server = new EmbeddableMcpServer({
  connection,
  handlersRegistry: exporter.createRegistry(),
});
```

`getHandlerEntries()` and `getToolNames()` give the same handlers without a server.

### Handler groups

- **ReadOnlyHandlersGroup** — read-only operations
- **HighLevelHandlersGroup** — high-level operations (create, update)
- **LowLevelHandlersGroup** — low-level ADT operations
- **SystemHandlersGroup** — system operations
- **SearchHandlersGroup** — search operations

## Files

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — server boot flow, transport/auth model, handler sets, runtime diagnostics tools, extension points
- **[STATEFUL_SESSION_GUIDE.md](STATEFUL_SESSION_GUIDE.md)** — stateful ADT request flow for lock/update/unlock
- **[TOOLS_ARCHITECTURE.md](TOOLS_ARCHITECTURE.md)** — how tools are organized and how `TOOL_DEFINITION` works
- **[CONNECTION_ISOLATION.md](CONNECTION_ISOLATION.md)** — per-session connection isolation between clients
- **[HANDLER_EXPORTER.md](HANDLER_EXPORTER.md)** — handler exporter usage

## Related Documentation

Documentation shipped in the dependency packages:

- `@mcp-abap-adt/adt-clients` — builder and lock client perspective
- `@mcp-abap-adt/connection` — connection layer perspective
