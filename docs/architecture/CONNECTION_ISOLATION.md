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

- **stdio** (`@mcp-abap-adt/core`): one instance for the life of the process, serving its one destination; its connection is built on the first tool call and kept while the destination's provider is the same one (D13).
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

`BaseMcpServer.getConnection(signal)` resolves the source, then builds the connector in one place (`src/lib/connectionFactory.ts`) from the settings and credential, and calls `connect()` — once per credential object: kept while the source answers the same one, built anew for a new one. The factory builds no credential from `settings.authType`.

### Session Lifecycle

1. **Session Creation**: stdio starts, a client opens an SSE connection, or an HTTP request arrives: a server instance is created (or, for HTTP, the pooled one a `state_handle` names is taken)
2. **Source**: the destination (stdio) or the headers (http, sse) become the instance's `ConnectionSource`
3. **Connection Creation**: the first tool call resolves the source and builds and connects the connector
4. **Renewal**: a `401` is put to the credential (`rejected`); a renewed token gets the request one more attempt. A header credential is fixed: nothing renews it
5. **Shutdown**: on `SIGTERM`/`SIGINT` the transport stops accepting; core's factory waits for provider calls in flight and flushes its broker

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
