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
  `createAbapConnection(settings, credential)` builds the connection — connection's
  `createConnection({ system, transport, … })`, with the system and the wire stated from the
  settings — and it is connected once per
  credential object. It is kept while the source answers the same credential object. The
  credential renews itself, since a `401` reaches its `rejected()`.
- **A shared connect:** every caller that asks while a connect runs shares it. Each caller's wait
  races its own signal: a cancelled caller settles at once, while the connect runs on for the
  others. A connect that succeeds after every caller cancelled is still the instance's connection:
  kept, used by the next call, and closed only by the instance's terminal close. A cancel causes no
  logoff.
- **Nothing in the chain takes a signal.** connection 16, interfaces-adt-connection 3,
  interfaces-adt 16 and adt-clients 31 have no request signal: the request's signal ends only the
  server's own waits (the connect, the provider, the login, the system lookup) and keeps a call
  whose tool has not started from reaching it. A started tool runs to its end.

### The tool wrapper

`registerHandlers(registry)` registers each tool of a `CompositeHandlersRegistry`'s groups
through one wrapper. A registry that registers its own tools (`registerAllTools`) is tracked the
same way.

1. **A request signal per call.** It aborts when the MCP request's `extra.signal` aborts (the
   client cancelled, or its transport closed) and when the call ends — nothing else aborts it. The
   call is registered at its entry, before any connection is built, in the one process-wide
   registry of live tools (`src/lib/activeTools.ts`: `activeTools()`, `settled(instance?)`,
   `latch(instance?)`, `pending()`), with its instance. The registry aborts nothing: a started
   tool runs to its end, and a shutdown or an instance close awaits its settlement. Once the
   process or the instance is latched, the call is refused right there — the shutdown refusal
   (`interactive-login` `aborted`, "The server is shutting down."), no connection, no handler.
   The call runs as its instance's (`runAsOwner`): a connection it opens is that instance's.
2. **The handler's context.** The wrapper builds a `HandlerContext`: `{ connection, logger, state,
   debugger }`, where `connection` comes from `getConnection(signal)`.
3. **The request signal scope.** The handler runs inside `runWithRequestSignal(signal, …)`;
   `currentRequestSignal()` reads it — for the server's own waits only: a tool's sends carry no
   request signal (D55), and nothing sent to SAP carries it. A call whose signal aborted
   before its tool starts never reaches the tool. The
   responsible person and master system the call lacks are resolved first, from the destination's
   `.env`, the request's headers and, on ABAP Cloud, the system.
4. **The answer.** A failure is read by `readFailure(thrown)`, which is lib's `failureOf`; core
   reads the destination layer's failures first. A failure it knows is answered as JSON `{ error,
   kind?, message, hint?, … }`: `authentication_failed`, `destination_refused`, or one of the
   server's own refusals (`inspection_only`,
   `fresh_connection_unavailable`, `credentials_required`). Anything else goes through
   `return_error`.

### Held state

An instance holds state between tool calls, such as a debug session, in `state` (`InstanceState`),
named by its handle (`stateHandle`). Held state ends after `stateIdleMinutes` without a tool call
(default 30). It also ends through its own stop tool, `dispose()` / `shutdownState()`, or the
system. `idle()` resolves when every tool call of the instance has settled.

### How an instance ends (D51, D55)

**The rule: every connection the server owns ends with `disconnect()`** — the logoff, which
releases the locks its SAP session holds. On connection 16 it resolves once the logoff is
**written**, not answered; it is called once per connection (a second call rejects), so every end
goes through `endConnection` (`src/lib/ownedConnections.ts`), which joins a close already under
way. Each connection is recorded there with its instance and role when it is made — the one
`getConnection` builds, a fresh connection, a package lock session, held state's own — and the
list of creation sites and their ends is `tools/connection-ends.json`, kept by a source test. A
connection the consumer injects is never recorded and never closed.

Ending an instance has two parts, kept apart:

- **The state undo** — `dispose()` (and `shutdownState()`: dispose, settle, once more, settle):
  callable again, each call retrying what the state could not undo. It closes no connection.
- **The terminal close** — `terminalClose()` (lib's `closeOwnedConnections(instance)`): the
  `disconnect()` of every connection the instance owns, each once, a failure logged in fixed
  words. Every terminal disposal runs it after the undo was tried, **never conditional on the undo
  succeeding**: a failed undo is reported, never a reason to keep a session — or a lock — open.

**The instance close** (`closeInstance(instance)`, `src/lib/instanceClose.ts`), one promise per
instance: `latch(instance)` in the tick it begins; await `settled(instance)` (none aborted); the
state undo; the terminal close, whatever the undo answered; the MCP server and its transport
closed. An SSE close, SSE's shutdown and core's shutdown use it; the pool runs the undo and the
terminal close when an instance leaves it.

**The forced close** (`forceClose()`): the logoff of every connection the process owns, joined
where one is under way, awaiting nothing that waits on a tool, a request, an instance close or a
state undo. The launchers use it for both escapes (a second signal, `--shutdown-timeout`) and for
a crash outside a tool (`uncaughtException`, `unhandledRejection`, registered beside the signals
in lib's `shutdownSequence.ts`): one fixed-words line naming the failure by its class, exit `1`; a
crash during a shutdown forces it, and a second crash joins the forced close under way. A killed
process (`SIGKILL`, out of memory) cannot log off: SAP's idle timeout ends its sessions and locks.

**A connection is replaced only when SAP lost its session** (D56), or when a new credential
arrives: `getConnection` builds a new instance for the next call, and the replaced one is logged
off once no call works on it any more — each call's use is counted when `getConnection` hands the
connection out, before any await, and ends with `connectionReleased(connection)` (the tool wrapper
calls it; a host that calls `getConnection` itself calls it too). A cancelled call causes no
logoff. The forced close also awaits, to its write, every logoff an orderly end already began.

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
- **Leaving the pool.** An instance that leaves the pool — nothing held after its request, its
  stop tool, the idle bound, shutdown — goes through the awaited `dispose()` and then the terminal
  close. One whose undo failed is kept for a retry (it has not left); when it leaves, the terminal
  close runs whatever the retry answered. After the idle bound's stop a pooled instance's
  connections are closed even when the undo failed.
- **Shutdown** (`beginShutdown()`, `stopListening()`, `lastStep()`, driven by lib's
  `installTransportShutdown`): the pool stops admitting (`503`) in the latch's tick, the listener
  closes, every registered tool settles, then the pool's shutdown disposes and logs off every
  instance and reports what could not be undone, each instance by its ordinal. `stop()` is the same
  for an embedder, without the wait on the tools.

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
- **Closing a connection.** One cleanup per connection, installed before the first setup await:
  the response's `close`, the stream's failure and a rejected `connect` all reach it. The session
  leaves the routing map first; then the instance close (above) — its tools awaited, its state
  undone, its connections logged off, its MCP server and stream closed. An instance whose
  connection closed during setup is never routed to.
- **Shutdown** (`stopListening()`, `lastStep()`): after every registered tool settled, the instance
  close of every connection, joined where one is already closing.

### EmbeddableMcpServer (`@mcp-abap-adt/lib`): the consumer's connection

```typescript
const server = new EmbeddableMcpServer({
  connection,                                  // used as given
  exposition: ['readonly', 'high'],
  systemType: 'onprem',
  // Build a new connection with its own credential; it receives no signal.
  freshConnection: async () => buildMyConnection(),
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
  | injected, with `freshConnection` | `await freshConnection()`: the consumer's factory, called with no argument |
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

  What the consumer keeps is what it built into the connection: its credential.
- **The factory receives no signal.** A fresh connection is made inside a started tool, which runs
  to its end, and nothing in the chain takes a signal (connection 16). A package lock's connection
  and a debug session's connection outlive the request that opened them.
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
