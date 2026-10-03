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

- **stdio**: one instance for the life of the process; its connection is built on the first tool call and kept.
- **SSE**: one instance per session.
- **HTTP (streamable)**: one instance per request, so a request never sees another request's connection.

What a connection is built from is its `ConnectionContext`: the **settings** (`connectionParams`: URL, client, authentication type, connection type -- no secret) and the **credential** (an `IAuthProvider`). The two come from separate sources:

| Request carries | Settings | Credential |
|:---|:---|:---|
| `x-mcp-destination` (with `--allow-destination-header`) or the default destination | `IDestinations.settingsFor(destination)` | `IDestinations.getProvider(destination)` |
| `x-sap-url` + `x-sap-jwt-token`, or + `x-sap-login` and `x-sap-password` | from the headers | built from the headers, owned by that request |

### Implementation Details

#### 1. A credential per destination, shared; a credential per header request, not

`AuthBrokerFactory` builds one broker, and one provider, per destination, on first use, and hands the provider out counted (so that shutdown can wait for what is in flight). Two sessions on the same destination share the provider: one token, one refresh token, one renewal in flight. Each is still its own connection (cookie jar, CSRF token, session). A connection built from headers has a credential of its own, built from those headers, and shares nothing.

#### 2. Request-scoped values

Values that belong to one request, such as the master language of created objects (`x-sap-language`), travel in a request-scoped context (`runWithRequestContext`) around the dispatch. They are never written to process-global state.

#### 3. Connection construction

`BaseMcpServer.getConnection()` builds the connector once, in one place (`src/lib/connectionFactory.ts`), from the context's settings and credential, and calls `connect()`. The credential is the one the caller hands in; the factory builds none from `settings.authType`.

### Session Lifecycle

1. **Session Creation**: a new client connects (SSE), or a request arrives (HTTP): a server instance is created
2. **Context**: the destination's settings and provider, or the headers' settings and credential, become the instance's `ConnectionContext`
3. **Connection Creation**: the first tool call builds and connects the connector
4. **Renewal**: a `401` is put to the credential (`rejected`); a renewed token gets the request one more attempt
5. **Shutdown**: on `SIGTERM`/`SIGINT` the transports stop accepting, the factory waits up to 30 s for provider calls in flight, and every broker is flushed

### Benefits

1. **Security**: no data leakage between clients: nothing about a connection is global
2. **Multi-Tenancy**: clients may connect to different SAP systems at once (by header, or by destination with `--allow-destination-header`)
3. **One login**: a destination's logins are serialised and its token is shared by the sessions that use it

## Example Flow

```
Client A (destination A, via x-mcp-destination):
  Request 1 → server instance → settingsFor(A) + getProvider(A) → connection A
Client B (destination B, via x-mcp-destination):
  Request 1 → server instance → settingsFor(B) + getProvider(B) → connection B
Client C (x-sap-* headers):
  Request 1 → server instance → settings + credential from the headers → connection C

Each connection has its own session; A and B each have their own provider and token.
```

## Related Documentation

- [Client Configuration Guide](../user-guide/CLIENT_CONFIGURATION.md)
- [Stateful Session Guide](./STATEFUL_SESSION_GUIDE.md)
