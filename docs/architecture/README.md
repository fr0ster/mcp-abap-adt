# Architecture Documentation

Technical documentation about the system architecture, design decisions, and internal structure.

## Packages

The repository holds sixteen npm packages (not npm workspaces; each is built and published by path):

| Directory | Package | Role |
|---|---|---|
| `src/` (root) | `@mcp-abap-adt/lib` | Handlers, handler groups, configuration, auth, connection factory — everything an embedding server needs |
| `server/` | `@mcp-abap-adt/core` | The `mcp-abap-adt` command: launcher and transports |
| `background-runs-memory/` | `@mcp-abap-adt/background-runs-memory` | The in-memory store of background runs (`IBackgroundRuns` of lib); core, http and sse create it |
| `compact-readonly-entries/`, `compact-modify/` | `@mcp-abap-adt/compact-readonly-entries`, `@mcp-abap-adt/compact-modify` | The two halves of the compact tool set |
| `http/`, `sse/` | `@mcp-abap-adt/http`, `@mcp-abap-adt/sse` | The `mcp-abap-adt-http` and `mcp-abap-adt-sse` commands |
| `compact/`, `compact-http/`, `compact-sse/` | `@mcp-abap-adt/compact`, `compact-http`, `compact-sse` | The compact commands: each transport's launcher with the compact tool list |
| `core-ro/`, `http-ro/`, `sse-ro/` | `@mcp-abap-adt/core-ro`, `http-ro`, `sse-ro` | The read-only commands (`mcp-abap-adt-ro`, `-http-ro`, `-sse-ro`): each transport's launcher with the read-only tool set |
| `compact-ro/`, `compact-http-ro/`, `compact-sse-ro/` | `@mcp-abap-adt/compact-ro`, `compact-http-ro`, `compact-sse-ro` | The read-only compact commands: each transport's launcher with the compact half that changes nothing |

The binary fixes the tool set (19.0.0): there is no `--exposition`. See
[Handlers Management](../user-guide/HANDLERS_MANAGEMENT.md).

### Standalone server

A binary is its transport, each reading its own parameter table:
- **StdioServer** — `mcp-abap-adt` (`server/src/launcher.ts`, `@mcp-abap-adt/core`), standard input/output for MCP clients
- **StreamableHttpServer** — `mcp-abap-adt-http` (`http/src/launcher.ts`, `@mcp-abap-adt/http`)
- **SseServer** — `mcp-abap-adt-sse` (`sse/src/launcher.ts`, `@mcp-abap-adt/sse`)

### Embedding the handlers

For embedding into an existing server (e.g. a CAP/CDS application):

```typescript
import { EmbeddableMcpServer } from '@mcp-abap-adt/lib/embeddable';
import { HandlerExporter } from '@mcp-abap-adt/lib/handlers';

const exporter = new HandlerExporter({
  includeReadOnly: true,
  includeHighLevel: true,
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
