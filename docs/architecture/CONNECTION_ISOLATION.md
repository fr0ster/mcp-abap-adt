# Connection Isolation Architecture

## Overview

The `mcp-abap-adt` server isolates connections per session or request to prevent data mixing between different clients. This ensures that when multiple clients connect to different SAP systems, each client receives only its own data.

## Problem Statement

In previous versions, the server used a global connection cache that could be overwritten by concurrent requests from different clients. This created a race condition where:

1. Client A connects to SAP System A
2. Client B connects to SAP System B (overwrites global config)
3. Client A's next request uses Client B's connection → **Data Leakage**

## Solution: One Server Instance per Session or Request

### Architecture

A connection belongs to the `BaseMcpServer` instance that built it, and that instance belongs to one session or one request:

- **stdio** (`@mcp-abap-adt/core`): one instance for the life of the process, serving its one destination; its connection is built at the process's start, before the MCP transport opens (the destination's one leftover session taken up, or a logon; a failure ends the process), and kept for the instance's life (D13 as amended by D56): only a session SAP already lost replaces it. On stdio the user is fixed for the process: the session is renewed (refresh token, or a new login when the refresh fails) and written back by the same provider — the same user — so the leftover-session tools' caller is the destination the instance serves (matched from the process's own settings and credential, with no request to SAP), and the background-run tools' caller is the user of the session the instance keeps — every tool runs in SAP as that user. HTTP and SSE never keep a connection across credentials.
- **SSE** (`@mcp-abap-adt/sse`): one instance per SSE connection, its credential from the `GET` that opened it.
- **HTTP (streamable)** (`@mcp-abap-adt/http`): one instance per request, or the pooled one its `state_handle` names; either way the request's own headers give its credential, so a request never sees another request's.

Each instance has one **connection source** (`ConnectionSource`, `src/embeddable/ConnectionContext.ts`), filled by its package; per call it answers the **settings** (URL, client, authentication type, connection type -- no secret) and the **credential** (an `IAuthProvider`):

| Package | Source | Settings | Credential |
|:---|:---|:---|:---|
| core (stdio) | `destinationSource` | `IDestinations.settingsFor(destination)` | `IDestinations.getProvider(destination, { signal })` |
| http, sse | `headerSource` (`@mcp-abap-adt/lib/http-transport`) | `x-sap-url`, `x-sap-client` | built from `x-sap-jwt-token`, or `x-sap-login` and `x-sap-password`, owned by that request (http) or connection (sse) |
| an embedder | `{ kind: 'injected', connection }` | — | the consumer's connection, used as given |

A request to http or sse without credentials is answered `400`, and so is one carrying `x-mcp-destination`: destinations are served only by core, over stdio.

### Implementation Details

#### 1. A credential per destination, shared; a credential per header request, not

`AuthBrokerFactory` (core) builds one broker, and one provider, for the process's destination, and hands the provider out counted (so that shutdown can wait for what is in flight). A connection built from headers has a credential of its own, built from those headers, and shares nothing: nothing is stored, shared or cached across requests (http) or connections (sse). The one exception is held state (a debug session): the connections it opened stay with it until it ends.

#### 2. Request-scoped values

Values that belong to one request, such as the master language of created objects (`x-sap-language`), travel in a request-scoped context (`runWithRequestContext`) around the dispatch. They are never written to process-global state.

#### 3. Connection construction

`BaseMcpServer.getConnection(signal)` resolves the source, then builds the connector in one place (`src/lib/connectionFactory.ts`) from the settings and credential, and calls `connect()` — once per credential object: kept while the source answers the same one, built anew for a new one (http, sse). stdio's source answers the same provider for the process's life, so only a session SAP already lost replaces its connection, built with that same provider. The factory builds no credential from `settings.authType`.

### Session Lifecycle

1. **Session Creation**: stdio starts, a client opens an SSE connection, or an HTTP request arrives: a server instance is created (or, for HTTP, the pooled one a `state_handle` names is taken)
2. **Source**: the destination (stdio) or the headers (http, sse) become the instance's `ConnectionSource`
3. **Connection Creation**: stdio's launcher builds and connects the connector at the start, before the transport opens (`connectAtStart`), any failure ending the process with exit `1`; http, sse and an embedder's instance at the first tool call, which resolves the source and builds and connects it. With the connection the server makes its parameters — the responsible, the user, the system — by `@mcp-abap-adt/responsible-rules` (the servers; an embedder only when it passes the rules), once per destination
4. **Renewal**: a `401` is put to the credential (`rejected`); a renewed token gets the request one more attempt. A header credential is fixed: nothing renews it
5. **The end**: on `SIGTERM`/`SIGINT` — and on stdio's stdin closing or an SSE stream closing, for that instance — every ADT session is logged off at once and the running tools interrupted, with no wait for a tool; core's factory then waits for provider calls in flight and flushes its broker. Over Streamable HTTP a dropped request closes nothing: the instance ends after its work, or at its state's stop or the idle bound

### The stateful window and the main flow

**Only `LOCK` and `UNLOCK` are sent stateful; writes under a lock and activation go
stateless** (D56). adt-clients (31.1) marks the two requests, each a request of its
own, and sets the connection back to stateless in a `finally` whatever the request
answered. The server sets no tool's session stateful (`tools/stateful-sites.json`).

**One MCP session = one connector = one main flow.** The calls of an instance that
work on its connection run strictly one after another, whatever the client sends at
once — the server enforces it. The shared connections are stdio's kept one and an SSE
connection's; Streamable HTTP builds one per request. Every send on the instance's
connection is inside the order; the system lookup (`systeminformation`, once per destination)
comes with the connection, when it is created, before any tool can use it; a background run, a listed
long read and the debugger tools that work on the debugger's own connections are
outside it. A long call on the main connection holds the flow; `background: true` or a
tool on its own connection does not. Once in the flow, a queued call checks its
connection again: when the call ahead found the session lost, it takes the replacement before its
tool runs, so only the call that met the loss fails (it is not replayed). Taking up a
leftover session is the stdio connector's birth at the process's start, before the transport
opens, not a change of a connector: there is no resume tool, so it takes no turn in the flow and
replaces nothing. A connection retired because another credential's call took
the instance (Streamable HTTP) stays the queued call's own: its session is its credential's.

- **Compact's `HandlerLock`** leaves the lock in the session until `HandlerUnlock`
  (the consumer's choice) where the connection lives across calls — stdio and SSE —
  with every call between them stateless; the instance's logoff ends it at the
  latest. Over Streamable HTTP the next request's credential retires the lock's
  connection, and its logoff releases the lock.
- **A tool call cannot be cancelled**: it ends with its result or with the session.
  A client's cancel aborts nothing — a queued call keeps its place, a running one
  runs to its end; no logoff, no new session. When the client closes its connection
  (stdio's stdin, an SSE stream) and at the process shutdown, the instance's sessions
  are logged off at once and its calls interrupted — nothing waits for a running tool
  or a request in flight; over Streamable HTTP a dropped request closes nothing.
- **A reopen only when SAP lost the session**: stdio's source answers the same
  provider for the process's life (the user is fixed; the session is renewed and
  written back by that provider), so its connection is replaced only then; a
  reopen of a live session would leave a lock held in it behind, or collide with the
  next one.

### Benefits

1. **Security**: no data leakage between clients: nothing about a connection is global
2. **Multi-Tenancy**: over http and sse, clients may connect to different SAP systems at once, each with its own headers
3. **One login**: stdio's destination logs in through its one provider, whose logins are serialised

## Example Flow

```
mcp-abap-adt-http, Client A (x-sap-* headers, user A):
  Request 1 → server instance → headerSource → credential A → connection A
mcp-abap-adt-http, Client B (x-sap-* headers, user B), at the same time:
  Request 1 → server instance → headerSource → credential B → connection B
mcp-abap-adt (stdio), destination D:
  Tool call → destinationSource → settingsFor(D) + getProvider(D) → connection D, kept

No two of them share a credential or a connection.
```

## Related Documentation

- [Client Configuration Guide](../user-guide/CLIENT_CONFIGURATION.md)
- [Stateful Session Guide](./STATEFUL_SESSION_GUIDE.md)
