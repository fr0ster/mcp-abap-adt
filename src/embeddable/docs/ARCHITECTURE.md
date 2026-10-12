# MCP Server Architecture

## Overview

Every server is an `McpServer` of `@modelcontextprotocol/sdk`, through lib's `BaseMcpServer`
(`@mcp-abap-adt/lib/embeddable`). Each transport is a package of its own, and each takes its
credentials from one place only:

| Server | Package | Where the credential comes from |
|---|---|---|
| `StdioServer` | `@mcp-abap-adt/core` (bin `mcp-abap-adt`) | the one destination the process serves, through the auth broker |
| `StreamableHttpServer` | `@mcp-abap-adt/http` (bin `mcp-abap-adt-http`) | each request's `x-sap-*` headers |
| `SseServer` | `@mcp-abap-adt/sse` (bin `mcp-abap-adt-sse`) | the `x-sap-*` headers of the `GET` that opens each SSE connection |
| `EmbeddableMcpServer` | `@mcp-abap-adt/lib` | the connection the host injects, used as given |

The handlers, the tool sets and the failure reader are lib's, and every server shares them.

## BaseMcpServer

### The connection context: the instance's one source

```typescript
type ConnectionContext = (
  | { kind: 'built'; source: ConnectionSource }        // core: the destination; http, sse: headers
  | { kind: 'injected'; connection: AbapConnection }   // an embedder's connection, used as given
) & { sessionId: string; metadata?: Record<string, unknown> };

interface ConnectionSource {
  resolve(signal: AbortSignal): Promise<{
    settings: SapConfig;          // URL, client, auth type, connection type: no secret
    credential: IAuthProvider;    // what the connector presents
    systemContext?: DestinationSystemContext;
  }>;
}
```

A server sets its context with `setConnectionContext(context)`:

- `StdioServer.start(destination)` sets it once, with core's `destinationSource(destination,
  destinations)`.
- `StreamableHttpServer` sets it per request, with `headerContext(req.headers)` from
  `@mcp-abap-adt/lib/http-transport`. A pooled instance also gets it on every request it serves.
- `SseServer` sets it once per SSE connection, from its `GET`.
- `EmbeddableMcpServer` sets it at construction, `{ kind: 'injected', connection }`.

Setting it reads nothing and sends nothing.

### `getConnection(signal)`

`getConnection(signal)` gives each tool call its connection, given the request's signal:

- **Injected:** the connection as given. There is no `resolve`, no `connect()` and no wrap.
- **Built:** the source resolves the settings and the credential with the request's `signal`.
  `createAbapConnection(settings, credential)` builds the connection, and it is connected once per
  credential object. It is kept while the source answers the same credential object. The
  credential renews itself, since a `401` reaches its `rejected()`.
- **A shared connect:** every caller that asks while a connect runs shares it. Each caller's wait
  races its own signal: a cancelled caller settles at once with `request_aborted`, while the
  connect runs on for the others. If no caller is left waiting when the connect succeeds, that
  late connection is disconnected and not kept.

### The tool wrapper

`registerHandlers(registry)` registers each tool of a `CompositeHandlersRegistry`'s groups
through one wrapper. A registry that registers its own tools (`registerAllTools`) is tracked the
same way.

1. **A request signal per call.** It aborts when the MCP request's `extra.signal` aborts (the
   client cancelled, or its transport closed), when the call ends, and when the process shuts
   down. The call is registered in the process-wide registry of live tools (`activeTools()`,
   `abortActiveTools()`) at its entry, before any connection is built.
2. **The handler's context.** The wrapper builds a `HandlerContext`: `{ connection, logger, state,
   debugger }`, where `connection` comes from `getConnection(signal)`.
3. **The request signal scope.** The handler runs inside `runWithRequestSignal(signal, …)`, so
   anything that sends for the call reads `currentRequestSignal()`. A call whose signal aborted
   before its tool starts never reaches the tool and is answered `request_aborted`. The
   responsible person and master system the call lacks are resolved first, from the destination's
   `.env`, the request's headers and, on ABAP Cloud, the system.
4. **The answer.** A failure is read by `readFailure(thrown)`, which is lib's `failureOf`; core
   reads the destination layer's failures first. A failure it knows is answered as JSON `{ error,
   kind?, message, hint?, … }`: `authentication_failed`, `destination_refused`,
   `request_aborted`, or one of the server's own refusals (`inspection_only`,
   `fresh_connection_unavailable`, `credentials_required`). Anything else goes through
   `return_error`.

### Held state

An instance holds state between tool calls, such as a debug session, in `state` (`InstanceState`),
named by its handle (`stateHandle`). Held state ends after `stateIdleMinutes` without a tool call
(default 30). It also ends through its own stop tool, `dispose()` / `shutdownState()`, or the
system. `idle()` resolves when every tool call of the instance has settled.

## The servers

### StdioServer (`@mcp-abap-adt/core`)

```typescript
const server = new StdioServer(registry, destinations /* IDestinations, or undefined */, options);
await server.start('trial'); // the destination the process serves; undefined: inspection-only
```

- **Destinations.** `IDestinations` is core's `AuthBrokerFactory`, built by the launcher. Per
  request it gives `settingsFor(destination)` and `getProvider(destination, { signal })`: the
  broker's cached provider while the destination is unchanged.
- **Inspection-only.** Without destinations the tools are listed, and a tool call answers
  `inspection_only` before any connection is built.
- **A login ended by another caller.** A request that joined a connect whose login another
  request's cancel ended retries once.

### StreamableHttpServer (`@mcp-abap-adt/http`)

```typescript
const server = new StreamableHttpServer(registry, { host, port, path, app, tls, ... });
await server.start(); // standalone, or registers its routes on `app` (registerRoutes)
```

- **Per request.** Each `POST` to `path` is checked:
  - `x-mcp-destination` is refused `400`;
  - the request's source is read from its `x-sap-*` headers, and a request without credentials is
    answered `400`.

  A new `StreamableHTTPServerTransport` then serves the request on an instance from the pool.
- **The instance pool.** A request without a `state_handle` gets an instance of its own. One that
  names a `state_handle` is routed to the instance holding that state. An instance is kept while
  it holds state and disposed when it no longer does. It goes back to the pool only after
  `idle()`.
- **`stop()`** drains the pool and reports what could not be undone.

### SseServer (`@mcp-abap-adt/sse`)

```typescript
const server = new SseServer(registry, { host, port, ssePath, postPath, app, tls, ... });
await server.start();
```

- **Opening a connection.** A `GET` on `ssePath` (default `/sse`) builds one `BaseMcpServer` for
  that connection. Its source is that `GET`'s `x-sap-*` headers, shared with no other connection.
- **Messages.** A `POST` on `postPath` (default `/messages`) is routed by its `sessionId` alone.
  Its own `x-sap-*` headers are not read.
- **Refusals.** A `GET` without credentials, and a `GET` or `POST` carrying `x-mcp-destination`,
  are answered `400`.
- **Closing a connection.** When a connection closes, its session is removed, its transport and
  MCP server are closed, and its held state is shut down.

### EmbeddableMcpServer (`@mcp-abap-adt/lib`): the consumer's connection

```typescript
const server = new EmbeddableMcpServer({
  connection,                                  // used as given
  exposition: ['readonly', 'high'],
  systemType: 'onprem',
  // Build a new connection with its own credential; honour the signal.
  freshConnection: async ({ signal }) => buildMyConnection({ signal }),
});
await server.connect(transport);
```

`EmbeddableMcpServer` uses the connection it is given exactly as it is. It does not build a
credential, wrap the connection or call `connect()` on it, and every tool call works on it. A
consumer that gives credentials per request builds an `EmbeddableMcpServer` per request with its
connection. Alternatively it mounts `StreamableHttpServer` or `SseServer` on its own app (the `app`
option), where the header rules above hold.

#### Fresh connections

Some operations need an ABAP session of their own:

- `CreatePackage` (high and low) and `LockPackage` over RFC;
- `DeletePackage` with `force_new_connection`;
- a debug session's own connections.

A package can be saved only once per ABAP session (PAK/058), which is why these cannot share the
caller's session. Such a fresh connection never comes from the injected connection's
configuration.

- **Where a fresh connection comes from** (`openFreshConnection`, `src/lib/packageSessions.ts`) is
  decided from a registry keyed by the connection object:

  | The connection | A fresh one comes from |
  |---|---|
  | built by the server (`createAbapConnection`: a destination, `x-sap-*` headers, a `SapConfig`) | the factory's record: the same settings and the same credential object |
  | injected, with `freshConnection` | `await freshConnection({ signal })`: the consumer's factory, given the current request's signal |
  | injected without it, or set through `setAbapConnectionOverride` | refused with `fresh_connection_unavailable`: "This operation needs an ABAP session of its own; the connection was given by the host, which supplied no fresh-connection factory (`freshConnection`)". Nothing is sent. |

  The registry is a `WeakMap`, so a connection the host drops is not kept. The latest injection of
  a connection object decides: a second `EmbeddableMcpServer` given the same object without
  `freshConnection` clears the earlier factory.
- **Ownership passes to the server** (D22). Once the factory returns a connection, the server
  treats it exactly like one it built:
  - it calls `connect()` on it, and if that fails it closes it and answers the failure. The same
    holds for a fresh connection the server builds from its record;
  - it holds it for the operation, or under the package lock's handle until the unlock;
  - it closes it with `disconnect()` when the operation, the lock or the debug session ends, and a
    failed close is logged in fixed words.

  What the consumer keeps is what it built into the connection: its credential, and its honouring
  of the signal.
- **The signal bounds the factory call only.** `signal` is the signal of the MCP request the
  operation serves. It aborts when the client cancels the request or the call ends. A factory that
  waits (a token, a pool) should end that wait when the signal aborts. The signal does **not**
  bound the life of the connection the factory returns. A package lock's connection and a debug
  session's connection outlive the request that opened them, so do not tie the connection to the
  signal. Honour the signal each request passes in its own options instead.
- **`DeletePackage` no longer falls back** to the caller's connection when no fresh connection can
  be had (D21). The refusal is the answer, never a delete on the session the caller asked to avoid.

## Tools: handlers, groups and tool sets

A handler takes the context the wrapper built and the tool's arguments:

```typescript
interface HandlerContext {
  connection: IAbapConnection;
  logger?: ILogger;
  state?: InstanceState;               // what the instance holds between calls
  debugger?: () => DebuggerInstance;   // the instance's debugger, created on first use
}

export async function handleCreatePackage(context: HandlerContext, args: CreatePackageArgs) {
  const { connection, logger } = context;
  return answer(
    { tool: 'CreatePackage', detail },
    () => createAdtClient(connection, logger).getPackage(/* … */).create(/* … */),
    project(detail, terseWrite),
  );
}
```

- **Registry and groups.** `IHandlersRegistry` is the registry a server takes;
  `CompositeHandlersRegistry` is the one built from handler groups (`IHandlerGroup`:
  `getName()`, `getHandlers()`, each a `TOOL_DEFINITION` with its handler). The groups are
  `ReadOnlyHandlersGroup`, `HighLevelHandlersGroup`, `LowLevelHandlersGroup`,
  `SystemHandlersGroup`, `SearchHandlersGroup` and `DebugHandlersGroup`.
- **Tool sets.** A binary's tools are its `ToolSet` (`@mcp-abap-adt/lib/tool-set`): the groups for
  an exposition, plus the exposition's row, default and help. `fullToolSet` covers readonly, high,
  low, debug and search. `compactToolSetOf({ readOnly, modify })` is the compact facade's.
  `registryOf(toolSet, exposition)` builds the registry.
- **Embedders.** `EmbeddableMcpServer` builds its registry from `exposition` (`readonly`, `high`,
  `low`, `compact`, `system`, `search`), or takes `handlersRegistry`.
- **Availability.** A tool is registered only if its `available_in` includes the instance's
  system type: the `systemType` option, else `SAP_SYSTEM_TYPE`.
