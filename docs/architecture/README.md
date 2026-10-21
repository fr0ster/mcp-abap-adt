# Architecture Documentation

Technical documentation about the system architecture, design decisions, and internal structure.

## Packages

The repository holds eighteen npm packages (not npm workspaces; each is built and published by path):

| Directory | Package | Role |
|---|---|---|
| `src/` (root) | `@mcp-abap-adt/lib` | Handlers, handler groups, configuration, auth, connection factory — everything an embedding server needs |
| `server-runtime/` | `@mcp-abap-adt/server-runtime` | The launch code of every server, no command of its own: the stdio launcher, `StdioServer` and the destination layer (`/stdio`, `/stdio/server`, `/auth`), the Streamable HTTP launcher and server (`/http`, `/http/server`), the HTTP+SSE launcher and server (`/sse`, `/sse/server`); installed with every server package |
| `server/` | `@mcp-abap-adt/core` | The `mcp-abap-adt` command: its bin and its version; its exports re-export server-runtime's stdio paths |
| `background-runs-memory/` | `@mcp-abap-adt/background-runs-memory` | The in-memory store of background runs (`IBackgroundRuns` of lib); core, http and sse create it |
| `responsible-rules/` | `@mcp-abap-adt/responsible-rules` | The rules that make a connection's responsible, user and system from its `systeminformation` (`SystemContextRules` of lib), and the system type the binaries require; core, http and sse pass them, lib applies none |
| `compact-readonly-entries/`, `compact-modify/` | `@mcp-abap-adt/compact-readonly-entries`, `@mcp-abap-adt/compact-modify` | The two halves of the compact tool set |
| `http/`, `sse/` | `@mcp-abap-adt/http`, `@mcp-abap-adt/sse` | The `mcp-abap-adt-http` and `mcp-abap-adt-sse` commands: their bins and versions; their exports re-export server-runtime's http and sse paths |
| `compact/`, `compact-http/`, `compact-sse/` | `@mcp-abap-adt/compact`, `compact-http`, `compact-sse` | The compact commands: server-runtime's launcher of each transport with the compact tool list |
| `core-ro/`, `http-ro/`, `sse-ro/` | `@mcp-abap-adt/core-ro`, `http-ro`, `sse-ro` | The read-only commands (`mcp-abap-adt-ro`, `-http-ro`, `-sse-ro`): server-runtime's launcher of each transport with the read-only tool set |
| `compact-ro/`, `compact-http-ro/`, `compact-sse-ro/` | `@mcp-abap-adt/compact-ro`, `compact-http-ro`, `compact-sse-ro` | The read-only compact commands: server-runtime's launcher of each transport with the compact half that changes nothing |

The binary fixes the tool set (19.0.0): there is no `--exposition`. See
[Handlers Management](../user-guide/HANDLERS_MANAGEMENT.md).

### One `lib` per server process (19.2.0)

What `lib` keeps at module level — the request context (`AsyncLocalStorage`), the
system-context cache, the connection registry, batch availability — is one per loaded copy.
A process that loads two copies of `lib` splits it: the server enters a request in one copy
and the handlers read the other, so a compact create was refused with
`system_context_missing`. 19.1.0 did that when a wrapper and
its former base were installed globally in one command (`compact` with `core`, `http-ro`
with `http`, `compact-sse-ro` with `sse`, …): each wrapper depended on its base, a binary
package, and npm placed the base at the global root with its own `lib` (measured, #303).

What made the second copy was **a binary package depending on another binary package**.
19.2.0 removes that edge:

- the launch code of all three transports lives in `@mcp-abap-adt/server-runtime`, which
  has no `bin`;
- every one of the twelve binary packages depends on `server-runtime`, `lib`,
  `background-runs-memory`, `responsible-rules` and its own tool-set halves — **never on
  another binary package**;
- `lib` is in `dependencies` of the binary packages only; `server-runtime`,
  `compact-readonly-entries`, `compact-modify`, `background-runs-memory` and
  `responsible-rules` take it as a **peer** (and `server-runtime` takes
  `background-runs-memory` and `responsible-rules` the same way), so the copy they use is
  the binary's.

Measured with the packed release (the install matrix, `src/__tests__/unit/installMatrix.test.ts`):
every layout loads one copy and shares the request state — global, a wrapper and its former
base in one command or in two (either order); local, hoisted and
`--install-strategy=nested`; a runtime at a later patch than the binary; and an embedder's
`compact-readonly-entries` with `lib`. npm deduplicates `lib` across compatible ranges even
under `--install-strategy=nested`, so the peer rule is a safeguard, not the cause of the fix:
it keeps a future range mismatch from giving a dependent its own copy.
`packageSet.test.ts` and `dependencyRule.test.ts` hold the rule.

**The guard.** Each loaded copy of `lib` registers itself once, when its
`src/lib/instance.ts` loads, on a process-wide array
(`globalThis[Symbol.for('@mcp-abap-adt/lib/instances')]`, read by `libInstances()`); every
entry of `lib`'s `exports` imports it. The entry's `file` is the module's `__filename` —
in a Node SEA executable, the executable's path — and `bundled` where there is none; it is
only shown, never resolved or compared. Each transport's `main` in `server-runtime` reads it
first, before any parameter — so before `--version` and `--help` too — and with more than one
copy prints one line on stderr and exits `1`:

```
Two copies of @mcp-abap-adt/lib are loaded in this process (<file>, <file>): reinstall <package> (npm install -g <package>).
```

`<package>` is the binary's own package. `lib` itself refuses nothing, so an embedder sees no
change. A supported install never reaches the guard; it names a defect (a hand-made tree, a
broken install) instead of letting it surface as a refused tool call.

### Standalone server

A binary is its transport, each reading its own parameter table:
- **StdioServer** — `mcp-abap-adt` (`server-runtime/src/stdio/launcher.ts`, `@mcp-abap-adt/core`), standard input/output for MCP clients
- **StreamableHttpServer** — `mcp-abap-adt-http` (`server-runtime/src/http/launcher.ts`, `@mcp-abap-adt/http`)
- **SseServer** — `mcp-abap-adt-sse` (`server-runtime/src/sse/launcher.ts`, `@mcp-abap-adt/sse`)

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
- **[REQUEST_HEADERS.md](REQUEST_HEADERS.md)** — the request header pairs of the adt-clients members: the defaults, the 406/415 correction, embedders and direct consumers

## Related Documentation

Documentation shipped in the dependency packages:

- `@mcp-abap-adt/adt-clients` — builder and lock client perspective
- `@mcp-abap-adt/connection` — connection layer perspective
