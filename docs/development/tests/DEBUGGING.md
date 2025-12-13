# Debugging Integration Tests

This guide explains how to debug integration tests for low-level handlers, especially focusing on session management and lock operations.

## Environment Variables for Debugging

### DEBUG_TESTS=true

Enables detailed logging in test files. Shows:
- Test step execution (Validate, Create, Lock, Update, Unlock, Activate)
- Session state changes between operations
- Lock handle extraction and usage
- Session ID tracking

**Usage:**
```bash
DEBUG_TESTS=true npm test -- integration/domain
```

**Example output:**
```
[DEBUG] LOCK: Starting lock for ZADT_BLD_DOM02
[DEBUG] LOCK data: {
  "session_id": "abc123...",
  "has_session_state": true,
  "session_state_cookies": "sap-usercontext=sap-client=100;..."
}
[DEBUG] LOCK: Lock completed, extracted session
[DEBUG] LOCK data: {
  "lock_handle": "xyz789...",
  "lock_session_id": "abc123...",
  "session_from_lock": {...}
}
```

### DEBUG_HANDLERS=true

Enables detailed logging in handler functions. Shows:
- Handler entry/exit points
- Session state restoration
- Lock handle usage
- Property validation
- Error details

**Usage:**
```bash
DEBUG_HANDLERS=true npm test -- integration/domain
```

**Example output:**
```json
{
  "level": "INFO",
  "timestamp": "2025-01-25T10:30:00.000Z",
  "handler": "LockDomain",
  "step": "start",
  "message": "Starting lock for ZADT_BLD_DOM02",
  "session_id": "abc123...",
  "has_session_state": true,
  "session_state_cookies": "sap-usercontext=..."
}
```

### DEBUG_ADT_LIBS=true

Enables logging from `@mcp-abap-adt/adt-clients` library.

### DEBUG_CONNECTORS=true

Enables logging from `@mcp-abap-adt/connection` library. Shows:
- HTTP requests and responses
- CSRF token management
- Cookie handling
- Session state management in connection layer

**Usage:**
```bash
DEBUG_CONNECTORS=true npm test -- integration/domain
```

### DEBUG_CONNECTION_MANAGER=true

Enables logging for connection manager (`getManagedConnection`). Shows:
- Connection cache operations (creation, reuse, cleanup)
- Connection signature matching
- Refresh token configuration
- Session-specific connection management

**Usage:**
```bash
DEBUG_CONNECTION_MANAGER=true npm test -- integration/domain
```

**Example output:**
```json
{
  "level": "DEBUG",
  "timestamp": "2025-11-27T06:59:04.734Z",
  "message": "[DEBUG] getManagedConnection - Reusing cached connection (signature matches)"
}
{
  "level": "DEBUG",
  "timestamp": "2025-11-27T06:59:04.735Z",
  "message": "[DEBUG] getManagedConnection - Creating new connection (cached: false, signature changed: true)"
}
{
  "level": "DEBUG",
  "timestamp": "2025-11-27T06:59:04.736Z",
  "message": "[DEBUG] getManagedConnection - Refresh token config:",
  "hasRefreshToken": true,
  "hasUaaUrl": true,
  "canRefresh": true
}
```

**Note:** This is separate from `DEBUG_CONNECTORS=true`. Use `DEBUG_CONNECTION_MANAGER=true` to debug connection caching and management, while `DEBUG_CONNECTORS=true` shows HTTP-level connection logs.

## Combined Debugging

Enable all debug flags for maximum visibility:

```bash
DEBUG_TESTS=true DEBUG_HANDLERS=true DEBUG_ADT_LIBS=true DEBUG_CONNECTORS=true DEBUG_CONNECTION_MANAGER=true npm test -- integration/domain
```

**Common combinations:**

```bash
# Connection-level debugging (HTTP, sessions, connection management)
DEBUG_CONNECTORS=true DEBUG_CONNECTION_MANAGER=true npm test -- integration/domain

# Test execution debugging
DEBUG_TESTS=true DEBUG_HANDLERS=true npm test -- integration/domain

# Full visibility (everything)
DEBUG_TESTS=true DEBUG_HANDLERS=true DEBUG_ADT_LIBS=true DEBUG_CONNECTORS=true DEBUG_CONNECTION_MANAGER=true npm test -- integration/domain
```

## Critical Session Management Points

### 1. Lock Operation

The `LockDomain` handler returns:
- `lock_handle`: Required for Update and Unlock
- `session_id`: Must be passed to Update and Unlock
- `session_state`: Contains cookies, CSRF token, and cookie store

**What to check:**
- ✅ Lock returns a valid `lock_handle`
- ✅ Lock returns `session_id` and `session_state`
- ✅ Session state contains cookies and CSRF token

### 2. Update Operation

The `UpdateDomain` handler **MUST** receive:
- `lock_handle` from Lock operation
- `session_id` from Lock operation
- `session_state` from Lock operation

**What to check:**
- ✅ Update receives `session_id` from Lock (not from Create or Validate)
- ✅ Update receives `session_state` from Lock
- ✅ Session state is restored before calling `client.updateDomain()`
- ✅ Properties include `packageName` or `package_name`

### 3. Unlock Operation

The `UnlockDomain` handler **MUST** receive:
- `lock_handle` from Lock operation
- `session_id` from Lock operation
- `session_state` from Lock operation

**What to check:**
- ✅ Unlock receives `session_id` from Lock (same as Update)
- ✅ Unlock receives `session_state` from Lock (same as Update)
- ✅ Session state is restored before calling `client.unlockDomain()`

## Common Issues

### Issue: "Package name is required" during Update

**Cause:** `DomainBuilder.update()` requires `packageName` in the config, but it's not being passed correctly.

**Solution:**
```typescript
const properties = {
  description: 'Updated description',
  datatype: 'CHAR',
  length: 10,
  packageName: packageName,  // ← Required (camelCase)
  // OR
  package_name: packageName  // ← Also accepted
};
```

### Issue: "Invalid lock handle or session" during Unlock

**Cause:** Session state from Lock was not passed to Unlock, or session expired.

**Solution:**
1. Extract session from Lock response:
   ```typescript
   const lockSession = extractLockSession(lockData);
   ```

2. Pass to Unlock:
   ```typescript
   await handleUnlockDomain({
     domain_name: domainName,
     lock_handle: lockHandle,
     session_id: lockSession.session_id,      // ← From Lock
     session_state: lockSession.session_state   // ← From Lock
   });
   ```

### Issue: Session state not persisting between operations

**Cause:** Session state is not being extracted and updated from handler responses.

**Solution:**
```typescript
// After each operation, update session:
session = updateSessionFromResponse(session, responseData);
```

## Debugging Workflow

1. **Enable debug flags:**
   ```bash
   DEBUG_TESTS=true DEBUG_HANDLERS=true npm test -- integration/domain
   ```

2. **Check Lock operation:**
   - Verify `lock_handle` is returned
   - Verify `session_id` and `session_state` are returned
   - Check session state contains cookies and CSRF token

3. **Check Update operation:**
   - Verify it receives `session_id` from Lock
   - Verify it receives `session_state` from Lock
   - Verify session state is restored before update
   - Check properties include `packageName`

4. **Check Unlock operation:**
   - Verify it receives same `session_id` as Update
   - Verify it receives same `session_state` as Update
   - Verify session state is restored before unlock

## Example Debug Output

With `DEBUG_TESTS=true` and `DEBUG_HANDLERS=true`:

```
[DEBUG] LOCK: Starting lock for ZADT_BLD_DOM02
{
  "level": "INFO",
  "handler": "LockDomain",
  "step": "restore_session",
  "message": "Restoring session state",
  "session_id": "abc123",
  "cookies_length": 137
}
{
  "level": "INFO",
  "handler": "LockDomain",
  "step": "success",
  "message": "Lock completed for ZADT_BLD_DOM02",
  "lock_handle": "xyz789",
  "updated_session_state": {
    "has_cookies": true,
    "cookies_length": 137
  }
}
[DEBUG] UPDATE: Starting update for ZADT_BLD_DOM02
{
  "level": "INFO",
  "handler": "UpdateDomain",
  "step": "restore_session",
  "message": "Restoring session state from Lock",
  "session_id": "abc123",
  "cookies_length": 137
}
```

## Tips

1. **Always use session from Lock** for Update and Unlock operations
2. **Check session state** contains cookies and CSRF token before each operation
3. **Verify lock handle** is the same across Lock, Update, and Unlock
4. **Check package name** is included in Update properties
5. **Use DEBUG_HANDLERS** to see exactly what handlers receive and return

---

# Debugging Server HTTP Requests

This section explains how to debug HTTP requests and MCP calls when running the server.

## Environment Variables for Server Debugging

### DEBUG_HTTP_REQUESTS=true

Enables logging of all incoming HTTP requests and MCP JSON-RPC calls. Shows:
- HTTP method, URL, headers (sensitive data is redacted)
- MCP JSON-RPC method, params (sensitive params are redacted)
- Session information
- Request/response flow

**Usage:**
```bash
DEBUG_HTTP_REQUESTS=true mcp-abap-adt --auth-broker
```

**Example output:**
```json
{
  "level": "INFO",
  "timestamp": "2025-01-25T10:30:00.000Z",
  "type": "HTTP_REQUEST",
  "message": "HTTP Request received",
  "method": "POST",
  "url": "/",
  "headers": {
    "content-type": "application/json",
    "x-sap-destination": "TRIAL",
    "authorization": "[REDACTED]"
  },
  "remoteAddress": "::1",
  "remotePort": 54321
}
{
  "level": "INFO",
  "timestamp": "2025-01-25T10:30:01.000Z",
  "type": "MCP_REQUEST",
  "message": "MCP Request",
  "method": "JSON-RPC",
  "jsonrpc": "2.0",
  "id": 1,
  "params": {
    "name": "tools/call",
    "arguments": {
      "tool": "get_class",
      "class_name": "ZCL_TEST"
    }
  },
  "sessionId": "abc123..."
}
```

### DEBUG_CONNECTORS=true

Enables all connection-level debugging, including:
- HTTP requests (same as `DEBUG_HTTP_REQUESTS=true`)
- CSRF token management
- Cookie handling
- Session state management
- Connection details

**Usage:**
```bash
DEBUG_CONNECTORS=true mcp-abap-adt --auth-broker
```

**Note:** `DEBUG_CONNECTORS=true` automatically enables `DEBUG_HTTP_REQUESTS=true`.

### DEBUG_AUTH_LOG=true or DEBUG_AUTH_BROKER=true

Enables debug logging for `auth-broker` package. Shows:
- Service key loading
- Token validation and refresh
- Browser authentication flow
- Session management

**Usage:**
```bash
# Using DEBUG_AUTH_LOG (original)
DEBUG_AUTH_LOG=true mcp-abap-adt --auth-broker

# Using DEBUG_AUTH_BROKER (alias, recommended)
DEBUG_AUTH_BROKER=true mcp-abap-adt --auth-broker
```

**Note:** `DEBUG_AUTH_BROKER=true` automatically sets `DEBUG_AUTH_LOG=true` for the auth-broker package.

### DEBUG_HANDLERS=true

Enables detailed logging in MCP handler functions. Shows:
- Handler entry/exit points
- Session state restoration
- Lock handle usage
- Property validation
- Error details

**Usage:**
```bash
DEBUG_HANDLERS=true mcp-abap-adt --auth-broker
```

### DEBUG_CONNECTION_MANAGER=true

Enables logging for connection manager (`getManagedConnection`). Shows:
- Connection cache operations (creation, reuse, cleanup)
- Connection signature matching
- Refresh token configuration
- Session-specific connection management

**Usage:**
```bash
DEBUG_CONNECTION_MANAGER=true mcp-abap-adt --auth-broker
```

## Combined Debugging

Enable all debug flags for maximum visibility:

```bash
DEBUG_HTTP_REQUESTS=true DEBUG_AUTH_LOG=true DEBUG_HANDLERS=true DEBUG_CONNECTORS=true DEBUG_CONNECTION_MANAGER=true mcp-abap-adt --auth-broker
```

**Common combinations:**

```bash
# HTTP requests and MCP calls only
DEBUG_HTTP_REQUESTS=true mcp-abap-adt --auth-broker

# Connection-level debugging (HTTP, sessions, connection management)
DEBUG_CONNECTORS=true DEBUG_CONNECTION_MANAGER=true mcp-abap-adt --auth-broker

# Authentication debugging
DEBUG_AUTH_BROKER=true mcp-abap-adt --auth-broker
# or
DEBUG_AUTH_LOG=true mcp-abap-adt --auth-broker

# Handler debugging
DEBUG_HANDLERS=true mcp-abap-adt --auth-broker

# Full visibility (everything)
DEBUG_HTTP_REQUESTS=true DEBUG_AUTH_BROKER=true DEBUG_HANDLERS=true DEBUG_CONNECTORS=true DEBUG_CONNECTION_MANAGER=true mcp-abap-adt --auth-broker
```

## Security Note

Sensitive data is automatically redacted in logs:
- `authorization` header → `[REDACTED]`
- `x-sap-jwt-token` → `[REDACTED]`
- `x-sap-refresh-token` → `[REDACTED]`
- `x-sap-password` → `[REDACTED]`
- `x-sap-uaa-client-secret` → `[REDACTED]`
- Any param containing `password`, `token`, or `secret` → `[REDACTED]`

## Output Format

All debug logs are written to `stderr` in JSON format to avoid interfering with MCP JSON-RPC protocol. This allows you to:

1. **View logs in terminal:**
   ```bash
   DEBUG_HTTP_REQUESTS=true mcp-abap-adt --auth-broker 2>&1 | jq
   ```

2. **Save logs to file:**
   ```bash
   DEBUG_HTTP_REQUESTS=true mcp-abap-adt --auth-broker 2>debug.log
   ```

3. **Filter specific log types:**
   ```bash
   DEBUG_HTTP_REQUESTS=true mcp-abap-adt --auth-broker 2>&1 | grep "HTTP_REQUEST"
   ```

