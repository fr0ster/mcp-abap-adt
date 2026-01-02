# Connection Isolation Architecture

## Overview

Starting from version 1.1.10, the `mcp-abap-adt` server implements per-session connection isolation to prevent data mixing between different clients. This ensures that when multiple clients connect to different SAP systems, each client receives only its own data.

## Problem Statement

In previous versions, the server used a global connection cache that could be overwritten by concurrent requests from different clients. This created a race condition where:

1. Client A connects to SAP System A
2. Client B connects to SAP System B (overwrites global config)
3. Client A's next request uses Client B's connection → **Data Leakage**

## Solution: Session-Based Connection Isolation

### Architecture

Each client session now maintains its own isolated SAP connection based on:
- **Session ID**: Unique identifier for each client session
- **Configuration Hash**: SHA-256 hash of `sapUrl` + authentication parameters

### Implementation Details

#### 1. Connection Cache Key Generation

```typescript
function generateConnectionCacheKey(sessionId: string, configSignature: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(sessionId);
  hash.update(configSignature);
  return hash.digest('hex');
}
```

The cache key ensures that:
- Same session + same config = same connection (reused)
- Different session or different config = different connection (isolated)

#### 2. AsyncLocalStorage Context

The server uses Node.js `AsyncLocalStorage` to pass session context to handlers:

```typescript
await sessionContext.run(
  {
    sessionId: session.sessionId,
    sapConfig: sessionSapConfig,
  },
  async () => {
    // All handlers in this context can access sessionId and sapConfig
    await transport.handleRequest(req, res, body);
  }
);
```

#### 3. Connection Retrieval

`getManagedConnection()` checks AsyncLocalStorage first:

```typescript
export function getManagedConnection(): AbapConnection {
  const context = sessionContext.getStore();
  
  if (context?.sessionId && context?.sapConfig) {
    // Use session-specific connection
    return getConnectionForSession(context.sessionId, context.sapConfig);
  }
  
  // Fallback to global cache (for backward compatibility)
  // ...
}
```

### Session Lifecycle

1. **Session Creation**: When a new client connects, a unique `sessionId` is generated
2. **Config Storage**: SAP configuration from HTTP headers is stored in the session object
3. **Connection Creation**: First request creates a connection with unique `sessionId` for the `AbapConnection`
4. **Connection Reuse**: Subsequent requests from the same session reuse the cached connection
5. **Session Cleanup**: When session closes, associated connection is removed from cache

### Benefits

1. **Security**: Prevents data leakage between clients
2. **Performance**: Connections are cached per session, reducing overhead
3. **Multi-Tenancy**: Supports multiple clients connecting to different SAP systems simultaneously
4. **Backward Compatibility**: Falls back to global cache for non-HTTP transports (stdio)

## Non-Local Connection Restrictions

### SSE Transport

SSE transport is **always** restricted to localhost connections only:
- Allowed: `127.0.0.1`, `::1`, `localhost`
- Rejected: Any other IP address (403 Forbidden)

This restriction ensures SSE is only used for local development/testing.

### HTTP Transport

HTTP transport has conditional restrictions based on `.env` file presence:

**When `.env` file exists:**
- Local connections: Always allowed
- Non-local connections: Allowed only if SAP headers are provided (`x-sap-url`, `x-sap-auth-type`)

**When `.env` file does not exist:**
- All connections: Allowed (enables multi-tenant scenarios)

### Rationale

- **With `.env` file**: Server is configured for a specific SAP system. Non-local connections without headers could be unauthorized access attempts.
- **Without `.env` file**: Server expects configuration via headers. All connections are allowed to support multi-tenant scenarios.

## Connection Cache Management

### Automatic Cleanup

The connection cache automatically removes old entries:
- **Max Age**: 1 hour
- **Trigger**: When cache size exceeds 100 entries
- **Method**: Iterates through cache and removes entries older than max age

### Manual Cleanup

Connections are also removed when:
- Session is closed (client disconnects)
- Connection is explicitly invalidated

## Example Flow

```
Client A (SAP System A):
  Request 1 → Session A created → Connection A created (cache key: hash(sessionA + configA))
  Request 2 → Session A found → Connection A reused
  Request 3 → Session A found → Connection A reused

Client B (SAP System B) - Concurrent:
  Request 1 → Session B created → Connection B created (cache key: hash(sessionB + configB))
  Request 2 → Session B found → Connection B reused

✅ No data mixing: Client A always uses Connection A, Client B always uses Connection B
```

## Related Documentation

- [Client Configuration Guide](../user-guide/CLIENT_CONFIGURATION.md)
- [Stateful Session Guide](./STATEFUL_SESSION_GUIDE.md)
