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
  whose session ended still waits for it; the instance's close and the shutdown do not — they log
  the connection off under it. A login inside it ends with the session: its party is the call's signal. A connect that
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
   `extra.signal`. The server hooks
   `server.server.onclose` for the session's end; an embedder that sets it replaces the hook and
   must chain the previous one. The
   call is registered at its entry, before any connection is built, in the one process-wide
   registry of live tools (`src/lib/activeTools.ts`: `activeTools()`, `settled(instance?)`,
   `latch(instance?)`, `interrupt(instance?)`, `pending()`), with its instance and its
   controller. A client's cancel aborts nothing; the instance close and the process shutdown
   interrupt the call (`interrupt`) in the tick they log its connections off. Once the
   process or the instance is latched, the call is refused right there — the shutdown refusal
   (`interactive-login` `aborted`, "The server is shutting down."), no connection, no handler.
   The call runs as its instance's (`runAsOwner`): a connection it opens is that instance's.
2. **The handler's context.** The wrapper builds a `HandlerContext`: `{ connection, logger, state,
   debugger }`, where `connection` comes from `getConnection(signal)`.
3. **The request signal scope.** The handler runs inside `runWithRequestSignal(signal, …)`;
   `currentRequestSignal()` reads it — for the server's own waits only: a tool's sends carry no
   request signal, and nothing sent to SAP carries it. A call whose signal aborted
   before its tool starts never reaches the tool. The
   responsible person and master system are resolved first: what the system names
   (`systeminformation`, on ABAP Cloud and on-premise), over anything configured; the destination's
   `.env` and the request's headers only where an on-premise system gives no information.
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

### How an instance ends

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
  words, joined with the instance's logoffs already under way; it waits for no request in
  flight. The pool and the idle bound run it after the undo was
  tried, **never conditional on the undo succeeding**: a failed undo is reported, never a reason to
  keep a session — or a lock — open.

**The instance close** (`closeInstance(instance)`, `src/lib/instanceClose.ts`; on the embeddable
entry, for an embedder whose client closed), one promise per instance, for a client that closed
its connection: in the tick it begins `latch(instance)`, the terminal close and
`interrupt(instance)` — every connection logged off under any request in flight, every call of
the instance interrupted (a queued one never starts), no running tool awaited, no state undo
sent (the logoff ends the state) —; then `letGoOfState()` (no idle bound any more) and the MCP
server and its transport closed. **A transport close that ends the session is the instance's
close**: unless the host states `transportCloseEndsSession: false` (a transport per request, as
Streamable HTTP), `BaseMcpServer` wires the protocol's `onclose` to `closeInstance(this)` — stdio's
transport, an SSE stream, an embedder's connected transport. Every other path joins the same
promise: the SSE stream-close wrapper (which also takes the session out of its routing map), the
stdio launcher's shutdown (its process-wide `logOffAtOnce` first; the logoffs already under way
are joined, never sent twice), and a later `terminalClose()`, which also waits for the instance's
logoffs under way. The pool runs the undo and the terminal close when an instance leaves it.

**A closed instance opens nothing.** The sweep runs once, so from the latch on — the instance's
or the process's — no connection is opened or owned for it (`ownedConnections.ts`):
`refuseIfClosed()` before `getConnection`'s logon, `openFreshConnection` (a host's factory is not
called) and the leftover logoff build anything, and `own()` ends at once and refuses a connection
recorded for a latched owner; both throw `ClosedInstanceRefusal`, answered as the shutdown
refusal. A connection whose `connect()` was under way at the latch was swept with the rest
(connection 17 writes its logoff once the connect settles) and is refused to its caller then
(`refuseWhenClosed`).

**The process's logoffs** (`logOffAtOnce()`, lib's `shutdownSequence.ts`): `forceClose()` — the
logoff of every connection the process owns, background runs' included, joined where one is under
way — and `interrupt()` of every live call, in one tick. Every launcher's shutdown begins with it
(stdio's on the end of stdin too): nothing waits for a running tool. It does await each logoff to
its **write** (connection 16's `disconnect()`): a write that never completes keeps the process
until it is killed (`SIGKILL`). **The forced close** (`forceClose()` again, without waiting for
the sequence's last steps) serves both escapes (a second signal, `--shutdown-timeout`) and
a crash outside a tool (`uncaughtException`, `unhandledRejection`, registered beside the signals
in lib's `shutdownSequence.ts`): one fixed-words line naming the failure by its class, exit `1`; a
crash during a shutdown forces it, and a second crash joins the forced close under way. A killed
process (`SIGKILL`, out of memory) cannot log off: SAP's idle timeout ends its sessions and locks,
unless a later stdio process of the same destination starts on it, or the user logs them off
(below).

**One main flow per instance**: the registered tool wrapper runs the calls that work on
the instance's connection one after another (`enterMainFlow`), whatever the client sends at once;
a background run, a listed long read and the debugger tools that work on the debugger's own
connections (`ownConnectionTools.ts`: every `Debug*`, `AmdpDebug*`, `HandlerDebug*` tool) take no
place in it. A connection's **parameters** — the responsible and master system its calls take, which also name
the debugger's request user and a background run's caller — are made once, with the connection,
per destination (the resolved credential and its target system: a new session of them — a
replacement after a lost session, a new logon after a gone leftover — keeps them): on stdio at the
start (`bornAtStart`, or the leftover session's file), a failure ending the process; on SSE once
per stream and on Streamable HTTP when the pooled instance's connection is created
(`buildConnection` → `requireSystem`), a failure that call's answer — the connection ends, nothing
is kept, and the next call that creates one asks again. Only a host's (injected) connection, or a
lookup whose parameters were not kept, is asked by the first call on it (`systemBeforeTool` →
`requireSystem`), inside the flow — a call outside the flow takes a turn in it for the lookup
alone. With no resolver (`systemContextResolver`, default none) nothing is looked up. The lookup
(`parametersOnce`: one in flight per connection) answers the information, no information, or a
credential failure — passed through as it came; what the parameters are is the host's rules'
(`SystemContextRules.parametersFor`, `src/lib/requestSystemResolution.ts`): core, http and sse pass
`@mcp-abap-adt/responsible-rules` (the information wins; ABAP Cloud one step to its error,
on-premise the stated responsible, else the login, else `system_user_unknown`; no kind
`system_type_required`), lib applies none — without rules the information is applied, no
information leaves the configured values, and nothing is refused for it; only parameters the rules
made, or the information, are kept. `withResolvedSystemContext` is the same mechanism for
`HandlerExporter`'s handlers and a group registered on its own, each with the resolver and rules
its host passes. No tool runs twice: the parameters come before the tool. The lookup is awaited to
its end whatever the call's signal says; the instance's close and the shutdown do not wait for it
— they log the connection off under it. The wrapper applies them (`withKnownSystemContext`) and sends nothing. A send on the instance's connection made
outside a tool's own run goes through `onMainConnection` — also handed to
handlers as `HandlerContext.onMainConnection(send)` — directly from a call that holds the flow, on
the connection that call holds, else in turn, on the connection `getConnection` hands inside the
flow (a session the call ahead lost already replaced), given back when the send is done; a holder
that holds no mark sends on the connection taken inside its turn. A queued call re-checks the
connection it took before it waited (`isStaleBuilt`): a spent one is given back and the current one
taken; a connection retired because another credential's call took the instance stays the queued
call's own. `send` is
handed that connection and must capture none of its own (`context.connection` may be the spent
one). A caller is its destination's parameters, answered without entering the flow when known
(else made with the instance's connection, through the flow). The leftover tools ask nothing of SAP: their caller is the instance's destination. The wait has no timeout; a call whose signal aborts while it waits leaves at once and never
reaches its tool. An embedder's own registry that is not a `CompositeHandlersRegistry`
(`registerAllTools(trackingRegistrations())`) takes its turn too: the server it is handed is the
instance itself (every member bound, `getConnection` and `onMainConnection` among them) and a
subclass's registry may call its protected members, so its callbacks can reach the instance's
connection. Every call enters the flow before its callback runs and leaves it when the callback
settled, whatever its name or arguments: the list a handler group's tools are read by
(`worksOnOwnConnection`) exempts none of them, since a name cannot prove a callback works on a
connection of its own. Inside its turn the instance's connection is taken and its parameters made
before the callback runs when it has none (`systemBeforeTool`), as for a handler group's tool: a
failure is that call's answer, the callback does not run, and
the next call asks again. The callback runs in the same system context scope
(`withDestinationSystemContext`, `withKnownSystemContext`), and the turn is marked held on that
connection (`inHeldFlow`): a send through `onMainConnection` from inside it runs at once on it
instead of queueing behind its own call. An instance with no connection source has nothing to
reach: the callback runs in its turn alone (`inHeldTurn`), nothing looked up. The instance close and the process shutdown interrupt every call — the queued ones
leave without sending — and log the connection off at once, under the running call. Once in the flow, a queued call
checks its connection again (`isStaleBuilt`): when the call ahead found the session lost, it gives
the spent connection back (`connectionReleased`) and takes the replacement (`getConnection`)
before its tool runs, so only the call that met the loss fails; it is not replayed.

**A connection is replaced only when SAP lost its session**, or when a new credential
arrives where the credential is the request's (http, sse); stdio's source answers the same
provider for the process's life: `getConnection` builds a new instance for the next call, and the replaced one is logged
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
  until then and while an on-premise system gives no information), `sessionCookies()`. The settings and the credential a resume needs
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
  `{ session: 'logged_on' }`). The file's system information is reused for the session picked up
  and for the new one (the same destination), read by the rules. Else `requireSystem` makes the
  parameters (core passes `@mcp-abap-adt/responsible-rules`: a refusal ends the start).
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
  refused at once without a fresh connection to be had (`freshConnectionAvailable`; its fixed words);
  the caller resolved (`backgroundCaller`: the user its destination's parameters name — made with
  the connection, no lookup of its own —, else the stated responsible, else the login
  — `SAP_USERNAME`, `x-sap-login`; an injected connection's URL from `getBaseUrl()`; none at all →
  `system_user_unknown`);
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
  close (`closeOwnedConnections`: the pool's eviction, the idle bound; an HTTP request's instance
  ends with its request and the run goes on). The instance that started it tracks it while it runs
  (`track` → `startedRuns`, per instance, refused once the instance is latched): `closeInstance`
  (an SSE stream's close, stdio's transport, an embedder's session-ending transport) calls
  `cutBackgroundRuns()` in the tick of its own logoffs — each such run's connection logged off at
  once, which cuts it — and awaits no run; another instance's runs are untouched. The process's
  logoffs (`logOffAtOnce` → `forceClose`, process-wide: every launcher's shutdown, stdio's client
  close) log every run off at once; the forced close names it. A cut run ends in the strategy by its
  own end — `finish` once its request settled, with what the run tool answered (SAP's answer when
  the request reached SAP before the logoff, else its error): nothing else is written for it.
- **The tools** (`GetBackgroundRun` / `ListBackgroundRuns` / `DiscardBackgroundRun`; compact
  `HandlerBackgroundRun{Get,List,Discard}`) are `connectionless` entries beside the run tools —
  the full set's `readonly` (with the system group, in `HandlerExporter` too), compact's `rw` —
  and read the instance's port (`HandlerContext.backgroundRuns`: the strategy and the call's
  caller). A handle that is not a non-empty string of at most 512 characters names no run.

### Batch mode: the owner

Batch mode records each single-request tool call instead of sending it, and sends the recorded calls
together at `BatchEnd` (batch-mode spec). Its state is one instance's, held by an owner the host
creates.

- **The owner** (`InstanceBatch`, `src/lib/batch/InstanceBatch.ts`, exported from
  `@mcp-abap-adt/lib/embeddable`): `new InstanceBatch({ keepRawParts })`, one per instance, never
  shared; no module global, nothing in `src/lib/batch` a singleton. It holds the mode (`mode()`:
  `'off'`, `'communication'` or `'debugger'` — one batch at a time), the open batch (`begin(kind,
  { connection, recorded })`, the batch's `AdtBatchConnection` and the record of its calls,
  `opened()`), its counter (`nextNumber()`: 1, 2, … in the order taken), its signal (`signal()`,
  aborted only when the batch is dropped), and the answers of the last executed batch
  (`end(answers)` replaces them, `answer(n)` reads one), kept until the next `end` or the
  instance's end. `begin` while a batch is open is refused `batch_mode_on` (the same kind) or
  `batch_mode_other` (the other kind); `nextNumber()` and `signal()` with none open,
  `batch_mode_off`. `drop()` lets the open batch go with nothing sent, aborts its signal and
  forgets the answers. The owner sends nothing itself.
- **Held state.** `InstanceBatch` is a `StatePart`, attached to the instance's `InstanceState` at
  construction (`BaseMcpServer`'s `batch` option): `holdsState()` is true while a batch is open or
  answers are kept — what keeps an HTTP instance in the pool between requests — so batch state is
  under the idle bound on every transport, the one clock that touches it. `dispose()` (the pool's
  undo, the idle bound) is `drop()`.
- **Who creates it.** core's launcher, one for its one instance (`StdioServer`'s `batch`);
  `StreamableHttpServer` and `SseServer` take `batch?: { keepRawParts }` and create one per pooled
  instance (`createPerRequestServer`) / per SSE connection; `EmbeddableMcpServer` takes the
  embedder's. `keepRawParts` is `--batch-keep-raw-parts` / `MCP_BATCH_KEEP_RAW_PARTS` / YAML
  `batch.keepRawParts` (`BATCH_KEEP_RAW_PARTS_ROW`, in every binary's table; default `false`).
  Absent, the batch tools answer `batch_mode_unavailable`.

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
- **A dropped request** closes nothing and ends no call: each instance is built with
  `transportCloseEndsSession: false`, so the request transport's close aborts no call signal — an
  admitted call waiting for its connection, its system lookup or its turn in the order, or
  running, runs to its end, its tool once — and its instance leaves the pool as above (after its
  work when it holds nothing; a pooled instance at its state's end).
- **Shutdown** (`beginShutdown()`, `stopListening()`, `releaseConnections()`, driven by lib's
  `installTransportShutdown`): the pool stops admitting (`503`) in the latch's tick, the listener
  closes, every connection of the process is logged off at once and every running tool
  interrupted (`logOffAtOnce`; no state undo, no tool awaited), then the client connections left
  are closed; exit `0`. `stop()`, for an embedder, is the pool's own shutdown instead: the
  requests awaited, every instance's state undone, then logged off, what could not be undone
  reported by ordinal.

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
  leaves the routing map first; then the instance close (above), as stdio's client close — its
  connections logged off at once, its calls interrupted (no tool awaited, no state undo), its
  state let go, its MCP server and stream closed. An instance whose connection closed during setup
  is never routed to.
- **Shutdown** (`stopListening()`, `releaseConnections()`): every connection of the process
  logged off at once and every running tool interrupted (`logOffAtOnce`), then every stream
  ended. `stop()`, for an embedder: the instance close of every connection, joined where one is
  already closing.

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
- **Ownership passes to the server**. Once the factory returns a connection, the server
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
  be had. The refusal is the answer, never a delete on the session the caller asked to avoid.

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
  binary (there is no `--exposition`): its groups, the TOOLS section of its help, its removed
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
  system type: the `systemType` option, else `SAP_SYSTEM_TYPE` — not required by lib (an
  embedder or `HandlerExporter` constructs without one); the binaries require it
  (`@mcp-abap-adt/responsible-rules`' `SYSTEM_TYPE_ROW`): stdio and the http/sse binaries do not
  start without one. A base server with none stated (stdio's
  inspection-only mode, an embedder's own transport host) filters nothing — every tool of its set
  is listed, no `cloud` default — and refuses every call that would reach the system.
