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
- **A shared connect:** every caller that asks while a connect runs shares it, and awaits it to
  its end whatever its signal says: the connect is a send on the instance's connection, so a call
  whose session ended still waits for it, and the instance's close comes after it (no logoff under
  it). A login inside it ends with the session: its party is the call's signal. A connect that
  succeeds is the instance's connection: kept, used by the next call, and closed only by the
  instance's terminal close.
- **Nothing in the chain takes a signal.** connection 16, interfaces-adt-connection 3,
  interfaces-adt 16 and adt-clients 31 have no request signal: the request's signal ends only the
  server's own waits that send nothing on the instance's connection (the provider, the login, the
  queue of the main flow) and keeps a call whose tool has not started from reaching it. A request
  already sent (the connect, the system lookup) is awaited to its end. A started tool runs to its
  end.

### The tool wrapper

`registerHandlers(registry)` registers each tool of a `CompositeHandlersRegistry`'s groups
through one wrapper. A registry that registers its own tools (`registerAllTools`) is tracked the
same way.

1. **A request signal per call.** It aborts when the session ends — the instance's transport
   closed (the protocol's `onclose`) — and when the call ends; nothing else aborts it. **A tool
   call cannot be cancelled:** the MCP request's `extra.signal`, which the SDK also aborts for a
   client's `notifications/cancelled`, is not read, so a cancel aborts nothing (the SDK then sends
   no answer to the cancelled request); a registry's own tool gets the call's signal as
   `extra.signal`. The
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

Of this machinery the embeddable entry exports `closeInstance` (with `ClosableInstance`) and
`activeTools()`; the latch, the settlement, the shutdown sentence and the shutdown sequence are
the launchers', reached through `@mcp-abap-adt/lib/state`.

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

**The instance close** (`closeInstance(instance)`, `src/lib/instanceClose.ts`; on the embeddable
entry, for an embedder closing its own instance), one promise per
instance: `latch(instance)` in the tick it begins; await `settled(instance)` (none aborted); the
state undo; the terminal close, whatever the undo answered; the MCP server and its transport
closed. An SSE close, SSE's shutdown and core's shutdown use it; the pool runs the undo and the
terminal close when an instance leaves it.

**The forced close** (`forceClose()`): the logoff of every connection the process owns, joined
where one is under way, awaiting nothing that waits on a tool, a request, an instance close or a
state undo. It does await each logoff to its **write** (connection 16's `disconnect()`): a write
that never completes keeps the process until it is killed (`SIGKILL`). The launchers use it for both escapes (a second signal, `--shutdown-timeout`) and for
a crash outside a tool (`uncaughtException`, `unhandledRejection`, registered beside the signals
in lib's `shutdownSequence.ts`): one fixed-words line naming the failure by its class, exit `1`; a
crash during a shutdown forces it, and a second crash joins the forced close under way. A killed
process (`SIGKILL`, out of memory) cannot log off: SAP's idle timeout ends its sessions and locks,
unless a later stdio process of the same destination starts on it, or the user logs them off
(below).

**One main flow per instance** (D56): the registered tool wrapper runs the calls that work on
the instance's connection one after another (`enterMainFlow`), whatever the client sends at once;
a background run, a listed long read and the debugger tools that work on the debugger's own
connections (`ownConnectionTools.ts`: every `Debug*`, `AmdpDebug*`, `HandlerDebug*` tool) take no
place in it. The ABAP Cloud system-context lookup is asked once per connection before a tool
runs on it, never after — no tool runs twice: on stdio at the start (`bornAtStart` →
`requireSystem`, or the leftover session's file), a failure ending the process; elsewhere by the
first call on a connection without it (`systemBeforeTool` → `requireSystem`), inside the flow — a
call outside the flow takes a turn in it for the lookup alone — its failure that call's answer (an
answer that names no user `system_without_user` — `requiringUser`: not a valid ABAP system for
this server —, a chain failure as it is, else `system_lookup_failed`), the tool not run, nothing
failed kept, so the next call asks again. The lookup is awaited to its end whatever the call's
signal says: the call's turn and its tracking last until it settled, so the next request on the
connection waits for it and the instance's close logs nothing off under it. A replacement of a connection of the same credential keeps the answer
(`buildConnection(…, known)`). The wrapper reads it (`withKnownSystemContext`) and sends nothing. A send on the instance's connection made
outside a tool's own run (an identity lookup) goes through `onMainConnection` — also handed to
handlers as `HandlerContext.onMainConnection(send)` — directly from a call that holds the flow, on
the connection that call holds, else in turn, on the connection `getConnection` hands inside the
flow (a session the call ahead lost already replaced), given back when the send is done; a holder
that holds no mark sends on the connection taken inside its turn. A queued call re-checks the
connection it took before it waited (`isStaleBuilt`): a spent one is given back and the current one
taken; a connection retired because another credential's call took the instance stays the queued
call's own. `send` is
handed that connection and must capture none of its own (`context.connection` may be the spent
one). A caller already known is answered without entering the flow: the backend user SAP named is
kept per credential object (a host's injected connection for its own) and valid only for the
connection it was asked on: the whole cache is forgotten whenever the instance's connection is
replaced (`forgetCallers`), and an answer asked on a connection replaced meanwhile is not
kept. The leftover tools ask nothing of SAP: their caller is the instance's destination. The wait has no timeout; a call whose signal aborts while it waits leaves at once and never
reaches its tool. An embedder's own registry that is not a `CompositeHandlersRegistry`
(`registerAllTools(trackingRegistrations())`) gets no main-flow queue: its tools take no place in
the flow. A shutdown or an instance's close lets the running call and every queued call run to their end before it goes on (D55: no started call is aborted); only an SSE close makes the queued calls leave, because that transport aborts their request signals. Once in the flow, a queued call
checks its connection again (`isStaleBuilt`): when the call ahead found the session lost, it gives
the spent connection back (`connectionReleased`) and takes the replacement (`getConnection`)
before its tool runs, so only the call that met the loss fails; it is not replayed.

**A connection is replaced only when SAP lost its session** (D56), or when a new credential
arrives where the credential is the request's (http, sse); stdio's source answers the same
provider for the process's life (D13): `getConnection` builds a new instance for the next call, and the replaced one is logged
off once no call works on it any more — each call's use is counted when `getConnection` hands the
connection out, before any await, and ends with `connectionReleased(connection)` — called
**exactly once per `getConnection`** (the tool wrapper calls it; a subclass that calls
`getConnection` itself calls it too; a missing release keeps a replaced connection open until the
terminal close, a second one ends it under another call). A tool call cannot be cancelled, and
the end of a call's session causes no logoff of its own. The forced close also awaits, to its write, every logoff an orderly end already began.

### Leftover sessions: the runtime files

What a killed process leaves behind is the next stdio process's to start on — the one leftover
session of its destination, at its start — and otherwise the user's to see and log off, through
two explicit tools; with several the server picks none.

- **The owner** (`LeftoverSessions`, `src/lib/leftoverSessions/`): one per process, created by the
  host — core's launcher (stdio); http's and sse's create none, since one such server holds the
  sessions of many users; an embedder decides whether to give one — and handed to the instances as
  `leftoverSessions`. It holds no module global. The directory is `runtimeDirectory(base?)`:
  `<config dir>/runtime`, the same config dir as `sessions/` (`--auth-broker-path`, else
  `AUTH_BROKER_PATH`'s first entry, else the platform's).
- **One file per owned HTTP connection that holds a session**, named by a random 128-bit handle:
  `getConnection`'s connection once connected (`track(connection, 'built', identity)`) and each
  debugger connection (`openStateful` → `trackSibling(connection, 'debugger', origin)`, the
  origin's identity). Contents (`format: 3`; another format is not read): pid and start time
  (`ProcessProbe`: `/proc` on Linux, the pid alone elsewhere), role, the destination's name and
  where it points (URL, client, system kind, wire), the backend user the destination states
  (`null` for a token credential, shown and never matched), `system` (the system information the
  session was looked up with — `describeSystem(connection, system)`, written once known; `null`
  until then and on-premise), `sessionCookies()`. The settings and the credential a resume needs
  come from the destination the process serves; the file adds the cookies and the system
  information, so a resume asks SAP nothing more. Directory `0700`, file `0600`, written atomically (a `.partial` renamed).
  Rewritten after a request whose answer changed the cookies (the owner wraps
  `makeAdtRequest`); deleted from inside the connection's end once its `disconnect()` resolved —
  `whenLoggedOff` in `ownedConnections.ts` — so the terminal close, a replacement and the forced
  close all delete it after the logoff is written, and a logoff that failed keeps it. Never
  logged, never in an answer. RFC keeps no file, and neither does an instance that serves no
  destination (`ConnectionContext.destination`, set by `StdioServer`). Nothing is asked of SAP
  to write it (`sessionOf` → `sessionIdentity(destination, settings, login)`).
- **The tools** (`ListLeftoverSessions` / `LogoffLeftoverSession`; compact
  `HandlerLeftoverSession{List,Logoff}`) — in every stdio binary, none in an http or sse binary
  (`ToolSet.groups(context, transport)`), and no resume tool anywhere — are
  `connectionless` entries: the tool wrapper calls them without `getConnection` (a list or a
  logoff must not log on) and hands them the instance's port (`HandlerContext.leftoverSessions`). The port
  resolves the caller from the instance's source (`resolveCaller`) and destination
  (`leftoverCaller`), sending nothing to SAP and building no connection, and a file is the
  caller's when it names the same destination pointing to the same place (the user is not
  read); an unknown handle, another destination's file, a live process's file and one another live process claimed are refused alike
  (`leftover_session_not_available`).
- **Claims.** Before acting, `claim` renames the file to `<handle>.claimed.<pid>.<start>` — the
  atomic step two processes race on; the loser finds nothing (a start that loses logs on). `adopt` (taken up), `forget` (logged off) or `release` (anything else: back to `<handle>`) ends the claim; a claimed file
  whose claimer died is listed and claimable again. Off Linux liveness is the pid alone.
- **The start** (stdio only): `StdioServer.connectAtStart(destination)`, called by the launcher
  before it opens the transport, runs `bornAtStart(signal)`: the source resolved, then
  `claimTheOne(identity)` — the one dead process's file of the destination with role `built`
  (debugger files are not counted), claimed; none, or more than one, is `undefined` and the
  start logs on (`buildConnection(credential, logOn)`), leaving several untouched. With one,
  `buildConnection(credential, resumedSession)`: `resumedSession` builds the connection with
  `createAbapConnection(…, session)`, owns it as `built`, connects (connection 17's takeover: one
  request in the session, without the credential), makes the file this process's (`adopt`, same
  handle), and takes the file's system information when it carries it. SAP's "gone" — `401`, or
  an answer not the session's (a `2xx`), read by status from connection's error (`sapAnswerOf`,
  `sessionGone`) — ends the spent takeover instance (it logged nothing on) and builds a new one
  with the normal logon (`connectedLogon`, connection's "a new session is a new instance"),
  adopted under the same handle: `{ session: 'new', handle }` (else `'picked_up'`; a logon is
  `{ session: 'logged_on' }`). Then `requireSystem` when the system information is not known.
  Any failure rejects the start — the launcher ends the process with exit `1` before the transport
  opens: another answer from the old session (a redirect included) or the new logon's failure
  gives the file back; a failed system lookup logs off a logon made for the start and leaves a
  picked-up session as it is. A tool call afterwards gets this connection from `getConnection`
  (the source answers the same credential). The list and the logoff take no turn — neither
  touches the instance's connection. After a start on a leftover session the server checks and
  repairs nothing (no lock probing, no replay): an ended session or lost locks reach the model as
  SAP answers. An embedder's instance has no start: it connects at its first tool call.
- **Logoff** builds a connection on the session (role `fresh`) and disconnects it without
  `connect()` (connection 17.1): one request, the ICF logoff, with the session's cookies but no
  `sap-contextid`, no credential (its `prepare()` is never called) and no CSRF fetch before it;
  resolved once written, its answer not read. Then the claimed file is deleted.

### Background runs: the strategy contract

A run of ABAP code cannot be cut (a running request dies with its socket or its session), so
`RuntimeRunClass`, `RuntimeRunProgram` and compact `HandlerProfileRun` take `background: true`:
the call answers at once with a handle and the run goes on (background-runs spec). Where runs and
their answers are kept is the host's: a strategy.

- **The contract** (`IBackgroundRuns`, `src/lib/backgroundRuns/contract.ts`, exported from
  `@mcp-abap-adt/lib/embeddable`): `start(caller, { tool, object, started_at })` → `{ handle }`
  (opaque, at least 128 random bits) or `{ refused: 'limit', limit }`; `finish(handle, answer,
  finishedAt)`, called once per started run by the library; `get(handle, caller)` → the run or
  `undefined`; `list(caller)` (no output); `discard(handle, caller)` → `'discarded'` | `'running'` |
  `'not-available'`. The caller is `{ url, client, user }`; `get` and `discard` answer an unknown
  handle and someone else's alike. Every method may answer a promise. The strategy decides only
  where runs are kept and how a handle is found (an embedder: its store, its routing between
  replicas).
- **lib ships no implementation.** An embedder implements `IBackgroundRuns`, or takes the
  servers' store from its own package, `@mcp-abap-adt/background-runs-memory` (an entry-surface
  test keeps every lib entry free of one).
- **The servers' implementation** (`InMemoryBackgroundRuns({ prefix? })`, package
  `@mcp-abap-adt/background-runs-memory`, `background-runs-memory/`): the process's memory,
  16 per caller (running plus kept), no process-wide limit, no TTL; the handle is the host's
  `prefix` (an instance id) and 128 random bits as hex. Created by each launcher and handed to its
  instances (`backgroundRuns` on `StdioServer`, `StreamableHttpServer`, `SseServer`,
  `EmbeddableMcpServer`, `BaseMcpServer`); no module global, and no default: an instance without
  one answers `background_runs_unavailable` to `background: true` (checked before any connection)
  and to the three tools.
- **The run** (`startBackgroundRun`, `src/lib/backgroundRuns/run.ts`), from the tool wrapper:
  refused at once without a fresh connection to be had (`freshConnectionAvailable`; D20's words);
  the caller resolved (`backgroundCaller`: the request's stated user — `SAP_USERNAME`,
  `x-sap-login` — else `systemUserOf` on the call's connection, cached per connection; an injected
  connection's URL from `getBaseUrl()`, its user SAP's; none at all → `background_run_caller_unknown`);
  registered in the registry of live tools under the calling instance (`"<tool> (background)"`) —
  refused there once the shutdown latched; its own connection opened by `openFreshConnection` and
  re-owned by the **strategy** (role `background`), stateless; `strategy.start` (a limit refusal
  closes that connection: `background_run_limit`, naming the limit and the discard tool); then the
  handler runs on that connection without the call waiting, inside its own request-signal scope.
  When SAP answers, the connection is logged off (`closeQuietly`), the answer — as the wrapper
  answers a tool, the failure reader's answer included — goes to `finish`, and the run leaves the
  registry. A group registered on its own `McpServer` (no instance, no strategy) refuses
  `background: true` instead of running in the foreground.
- **Its ends.** Owned by the strategy, the connection is not reached by any instance's terminal
  close (an HTTP request's instance ends with its request; the run goes on). Registered under its
  instance, the run is awaited by `settled()` (every launcher's orderly shutdown) and
  `settled(instance)` (`closeInstance`: an SSE close, stdio's shutdown) — as a running tool; the
  forced close (`forceClose`, process-wide) logs it off at once, which cuts it, and names it.
- **The tools** (`GetBackgroundRun` / `ListBackgroundRuns` / `DiscardBackgroundRun`; compact
  `HandlerBackgroundRun{Get,List,Discard}`) are `connectionless` entries beside the run tools —
  the full set's `readonly` (with the system group, in `HandlerExporter` too), compact's `rw` —
  and read the instance's port (`HandlerContext.backgroundRuns`: the strategy and the call's
  caller). A handle that is not a non-empty string of at most 512 characters names no run.

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
- **No retry of a login.** A login ends with its result, the server (the bound, the shutdown) or
  the session — never by another call's cancel — so a request that joined it answers its outcome.

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

- `CreatePackage` (high, and compact's `HandlerCreate` PACKAGE) and compact's `HandlerLock`
  PACKAGE over RFC;
- compact's `HandlerDelete` PACKAGE with `force_new_connection`;
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
  `ReadOnlyHandlersGroup`, `HighLevelHandlersGroup`, `SystemHandlersGroup`,
  `SearchHandlersGroup` and `DebugHandlersGroup` (`LowLevelHandlersGroup` is gone since 19.0.0).
- **Tool sets.** A binary's tools are its `ToolSet` (`@mcp-abap-adt/lib/tool-set`), fixed by the
  binary (C23; there is no `--exposition`): its groups, the TOOLS section of its help, its removed
  `--exposition` and whether it serves background runs. `fullToolSet` covers readonly, high, debug,
  search, background runs and, on stdio, the leftover sessions; `fullReadOnlyToolSet` readonly,
  search and, on stdio, the leftover-session list and logoff; `compactToolSetOf({ readOnly, modify })`
  is the compact facade's, `compactReadOnlyToolSetOf(readOnly)` its read-only half's. The
  transport is a set's one other dimension: `groups(context, transport)` builds the
  leftover-session group for `'stdio'` only, and `registryOf(toolSet, transport)` builds the
  registry.
- **Embedders.** `EmbeddableMcpServer` builds its registry from `exposition` (`readonly`, `high`,
  `compact`, `system`, `search`), or takes `handlersRegistry`.
- **Availability.** A tool is registered only if its `available_in` includes the instance's
  system type: the `systemType` option, else `SAP_SYSTEM_TYPE`.
