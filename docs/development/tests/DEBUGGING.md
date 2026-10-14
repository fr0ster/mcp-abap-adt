# Debugging Integration Tests

This guide explains how to debug the integration tests, especially session management and lock operations.

## Environment Variables for Debugging

### DEBUG_TESTS=true

Enables detailed logging in test files. Shows:
- Test step execution (Validate, Create, Lock, Update, Unlock, Activate)
- Lock handle extraction and usage

**Usage:**
```bash
DEBUG_TESTS=true npm test -- integration/domain
```

**Example output:**
```
[DEBUG] LOCK: Starting lock for ZADT_BLD_DOM02
[DEBUG] LOCK: Lock completed
[DEBUG] LOCK data: {
  "lock_handle": "xyz789..."
}
```

### DEBUG_HANDLERS=true

Enables detailed logging in handler functions. Shows:
- Handler entry/exit points
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
  "message": "Starting lock for ZADT_BLD_DOM02"
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

## Lock, update, unlock: what carries the lock

A lock lives in the server instance's own SAP session, and the `lock_handle` is the only thing a
caller carries between the calls. The tools take no `session_id` or `session_state` (removed in
19.0.0): every call of one MCP session runs on the instance's one connection, one call at a time.
Only the `LOCK` and the `UNLOCK` are sent stateful; the write under the lock goes stateless with the
handle (see `docs/architecture/STATEFUL_SESSION_GUIDE.md`).

**What to check:**
- ✅ Lock returns a valid `lock_handle`
- ✅ Update and Unlock receive that `lock_handle`
- ✅ Properties include `packageName` or `package_name` on an update

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

### Issue: "Invalid lock handle" during Unlock

**Cause:** the lock was taken in another SAP session: another MCP session or instance (over
Streamable HTTP each request has its own), or a session SAP lost meanwhile (its logoff released the
lock).

**Solution:** lock, update and unlock in one MCP session over stdio or SSE, or use the update tool
without a `lock_handle` (it locks, writes and unlocks in one call).

## Debugging Workflow

1. **Enable debug flags:**
   ```bash
   DEBUG_TESTS=true DEBUG_HANDLERS=true npm test -- integration/domain
   ```

2. **Check Lock operation:** verify `lock_handle` is returned.

3. **Check Update and Unlock operations:** verify each receives the same `lock_handle`, and that the
   update's properties include `packageName`.

## Tips

1. **Verify lock handle** is the same across Lock, Update, and Unlock
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
DEBUG_HTTP_REQUESTS=true mcp-abap-adt --mcp=TRIAL
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
    "x-sap-url": "https://your-sap-url.example",
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
DEBUG_CONNECTORS=true mcp-abap-adt --mcp=TRIAL
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
DEBUG_AUTH_LOG=true mcp-abap-adt --mcp=TRIAL

# Using DEBUG_AUTH_BROKER (alias, recommended)
DEBUG_AUTH_BROKER=true mcp-abap-adt --mcp=TRIAL
```

**Note:** `DEBUG_AUTH_BROKER=true` automatically sets `DEBUG_AUTH_LOG=true` for the auth-broker package.

### DEBUG_HANDLERS=true

Enables detailed logging in MCP handler functions. Shows:
- Handler entry/exit points
- Lock handle usage
- Property validation
- Error details

**Usage:**
```bash
DEBUG_HANDLERS=true mcp-abap-adt --mcp=TRIAL
```

### DEBUG_CONNECTION_MANAGER=true

Enables logging for connection manager (`getManagedConnection`). Shows:
- Connection cache operations (creation, reuse, cleanup)
- Connection signature matching
- Refresh token configuration
- Session-specific connection management

**Usage:**
```bash
DEBUG_CONNECTION_MANAGER=true mcp-abap-adt --mcp=TRIAL
```

## Combined Debugging

Enable all debug flags for maximum visibility:

```bash
DEBUG_HTTP_REQUESTS=true DEBUG_AUTH_LOG=true DEBUG_HANDLERS=true DEBUG_CONNECTORS=true DEBUG_CONNECTION_MANAGER=true mcp-abap-adt --mcp=TRIAL
```

**Common combinations:**

```bash
# HTTP requests and MCP calls only
DEBUG_HTTP_REQUESTS=true mcp-abap-adt --mcp=TRIAL

# Connection-level debugging (HTTP, sessions, connection management)
DEBUG_CONNECTORS=true DEBUG_CONNECTION_MANAGER=true mcp-abap-adt --mcp=TRIAL

# Authentication debugging
DEBUG_AUTH_BROKER=true mcp-abap-adt --mcp=TRIAL
# or
DEBUG_AUTH_LOG=true mcp-abap-adt --mcp=TRIAL

# Handler debugging
DEBUG_HANDLERS=true mcp-abap-adt --mcp=TRIAL

# Full visibility (everything)
DEBUG_HTTP_REQUESTS=true DEBUG_AUTH_BROKER=true DEBUG_HANDLERS=true DEBUG_CONNECTORS=true DEBUG_CONNECTION_MANAGER=true mcp-abap-adt --mcp=TRIAL
```

## Security Note

Sensitive data is automatically redacted in logs:
- `authorization` header → `[REDACTED]`
- `x-sap-jwt-token` → `[REDACTED]`
- `x-sap-password` → `[REDACTED]`
- `x-sap-uaa-client-secret` → `[REDACTED]`
- Any param containing `password`, `token`, or `secret` → `[REDACTED]`

## Output Format

All debug logs are written to `stderr` in JSON format to avoid interfering with MCP JSON-RPC protocol. This allows you to:

1. **View logs in terminal:**
   ```bash
   DEBUG_HTTP_REQUESTS=true mcp-abap-adt --mcp=TRIAL 2>&1 | jq
   ```

2. **Save logs to file:**
   ```bash
   DEBUG_HTTP_REQUESTS=true mcp-abap-adt --mcp=TRIAL 2>debug.log
   ```

3. **Filter specific log types:**
   ```bash
   DEBUG_HTTP_REQUESTS=true mcp-abap-adt --mcp=TRIAL 2>&1 | grep "HTTP_REQUEST"
   ```

