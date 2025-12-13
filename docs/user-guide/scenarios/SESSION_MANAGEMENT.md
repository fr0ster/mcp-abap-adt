# Session Management in Low-Level Handlers

This guide explains how to manage stateful sessions when using low-level MCP handlers.

## What is a Session?

A **session** in the context of MCP ABAP ADT handlers represents a stateful connection to the SAP system. It includes:

- **Session ID** (`session_id`) - A unique identifier for the session
- **Session State** (`session_state`) - Contains:
  - `cookies` - SAP session cookies (authentication, context)
  - `csrf_token` - CSRF protection token
  - `cookie_store` - Additional cookie storage

## Why Sessions Matter

Sessions are **critical** for operations that modify ABAP objects because:

1. **Lock Management** - Locks are tied to a specific session
2. **Stateful Operations** - Lock → Update → Unlock must use the same session
   - **CRITICAL**: Lock handler returns `session_id` and `session_state` that MUST be used in Update and Unlock operations
3. **Cookie Preservation** - SAP requires cookies to be consistent across requests
4. **CSRF Protection** - CSRF tokens must match the session

## Getting a Session

### Step 1: Call GetSession

**Tool**: `GetSession`

**Request**:
```json
{
  "force_new": false
}
```

**Response**:
```json
{
  "success": true,
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "SAP_SESSIONID_E19_100=xyz123...; sap-usercontext=sap-client=100",
    "csrf_token": "AbCdEf123456",
    "cookie_store": {}
  },
  "message": "Session ID generated. Use this session_id in subsequent requests..."
}
```

### Step 2: Store Session Information

Save both `session_id` and `session_state` for all subsequent operations:

```python
session_id = response["session_id"]
session_state = response["session_state"]
```

## Using Sessions in Operations

### Passing Session to Handlers

Every low-level handler that modifies objects accepts `session_id` and `session_state`:

```json
{
  "object_name": "ZCL_MY_CLASS",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  }
}
```

### Updating Session State

**Important**: After each operation, **always** update your `session_state` from the response:

```python
# Before operation
session_state = {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
}

# Call handler
result = lock_class(
    class_name="ZCL_MY_CLASS",
    session_id=session_id,
    session_state=session_state
)

# Update session state from response
session_state = result["session_state"]  # ← Always update!
```

**Why?** The session state may change after each operation (new cookies, updated CSRF token, etc.).

## Session Lifecycle

### Typical Workflow

```
1. GetSession → Get initial session
2. Validate → Use session (update session_state)
3. Create → Use session (update session_state)
4. Lock → Use session (update session_state, get lock_handle)
5. Update → Use session (update session_state)
6. Unlock → Use session (update session_state)
7. Activate → Use session (update session_state)
```

### Complete Example

```python
# Step 1: Get session
session = get_session()
session_id = session["session_id"]
session_state = session["session_state"]

# Step 2: Validate (update session_state)
validation = validate_class(
    class_name="ZCL_MY_CLASS",
    session_id=session_id,
    session_state=session_state
)
session_state = validation["session_state"]  # ← Update

# Step 3: Create (update session_state)
create_result = create_class(
    class_name="ZCL_MY_CLASS",
    session_id=session_id,
    session_state=session_state
)
session_state = create_result["session_state"]  # ← Update

# Step 4: Lock (CRITICAL: save session_id and session_state from response)
lock_result = lock_class(
    class_name="ZCL_MY_CLASS",
    session_id=session_id,
    session_state=session_state
)
lock_handle = lock_result["lock_handle"]
# CRITICAL: Save session_id and session_state from Lock response
# These MUST be used in Update and Unlock operations
lock_session_id = lock_result["session_id"]
lock_session_state = lock_result["session_state"]

# Step 5: Update (CRITICAL: use session from Lock response)
update_result = update_class(
    class_name="ZCL_MY_CLASS",
    source_code="...",
    lock_handle=lock_handle,
    session_id=lock_session_id,  # ← From Lock response
    session_state=lock_session_state  # ← From Lock response
)
session_state = update_result["session_state"]  # ← Update for subsequent operations

# Step 6: Unlock (CRITICAL: use session from Lock response)
unlock_result = unlock_class(
    class_name="ZCL_MY_CLASS",
    lock_handle=lock_handle,
    session_id=lock_session_id,  # ← From Lock response
    session_state=lock_session_state  # ← From Lock response
)
session_state = unlock_result["session_state"]  # ← Update for subsequent operations

# Step 7: Activate (update session_state)
activate_result = activate_class(
    class_name="ZCL_MY_CLASS",
    session_id=session_id,
    session_state=session_state
)
session_state = activate_result["session_state"]  # ← Update
```

## Critical Rules

### ✅ DO

1. **Always use the same `session_id`** for all operations in a workflow
2. **CRITICAL: Lock returns session parameters** - Always save `session_id` and `session_state` from Lock response
3. **CRITICAL: Same session for Lock-Update-Unlock** - Lock, Update, and Unlock MUST use the same `session_id` and `session_state` from Lock response
4. **Always update `session_state`** from each response
5. **Always pass both `session_id` and `session_state`** to handlers
6. **Always unlock** in finally blocks, even on errors
7. **Always use updated `session_state`** for subsequent operations

### ❌ DON'T

1. **Don't mix sessions** - Don't use different `session_id` values in the same workflow
2. **Don't reuse old `session_state`** - Always use the latest from the previous response
3. **Don't skip session updates** - Each operation may change the session state
4. **Don't forget to unlock** - Objects will remain locked if you don't unlock

## Common Mistakes

### Mistake 1: Not Updating Session State

```python
# ❌ WRONG
session_state = initial_session_state
lock_result = lock_class(..., session_state=session_state)
# Forgot to update session_state!
update_result = update_class(..., session_state=session_state)  # Using old state!
```

```python
# ✅ CORRECT
session_state = initial_session_state
lock_result = lock_class(..., session_state=session_state)
session_state = lock_result["session_state"]  # Update!
update_result = update_class(..., session_state=session_state)  # Using new state!
```

### Mistake 2: Using Different Session IDs

```python
# ❌ WRONG
session1 = get_session()
lock_result = lock_class(..., session_id=session1["session_id"])

session2 = get_session()  # New session!
update_result = update_class(..., session_id=session2["session_id"])  # Different session!
```

```python
# ✅ CORRECT
session = get_session()
session_id = session["session_id"]
session_state = session["session_state"]

lock_result = lock_class(..., session_id=session_id, session_state=session_state)
# CRITICAL: Save session from Lock response
lock_session_id = lock_result["session_id"]
lock_session_state = lock_result["session_state"]

update_result = update_class(
    ...,
    session_id=lock_session_id,  # ← From Lock response
    session_state=lock_session_state  # ← From Lock response
)  # Same session!
```

### Mistake 3: Not Passing Session to All Operations

```python
# ❌ WRONG
session = get_session()
lock_result = lock_class(..., session_id=session["session_id"], session_state=session["session_state"])
# Forgot to pass session to update!
update_result = update_class(..., source_code="...", lock_handle=lock_handle)  # Missing session!
```

```python
# ✅ CORRECT
session = get_session()
session_id = session["session_id"]
session_state = session["session_state"]

lock_result = lock_class(..., session_id=session_id, session_state=session_state)
# CRITICAL: Save session from Lock response
lock_session_id = lock_result["session_id"]
lock_session_state = lock_result["session_state"]

update_result = update_class(
    ...,
    source_code="...",
    lock_handle=lock_handle,
    session_id=lock_session_id,  # ← From Lock response
    session_state=lock_session_state  # ← From Lock response
)
```

## Session Expiration

Sessions may expire if:

- **Timeout** - SAP sessions typically expire after 15-30 minutes of inactivity
- **Server restart** - SAP server restart invalidates all sessions
- **Manual logout** - User manually logs out

### Handling Expired Sessions

If you get an error like "Session expired" or "CSRF token invalid":

1. **Get a new session** using `GetSession`
2. **Restart the workflow** from the beginning
3. **Or** unlock any locked objects first (if you have the lock handle)

```python
try:
    # Your workflow
    ...
except SessionExpiredError:
    # Get new session
    new_session = get_session()
    session_id = new_session["session_id"]
    session_state = new_session["session_state"]
    
    # Try to unlock if we have lock_handle
    if 'lock_handle' in locals():
        try:
            unlock_class(
                class_name="ZCL_MY_CLASS",
                lock_handle=lock_handle,
                session_id=session_id,
                session_state=session_state
            )
        except:
            pass  # Lock may have expired too
    
    # Restart workflow or report error
    raise Error("Session expired. Please retry the operation.")
```

## Best Practices

1. **One session per workflow** - Use the same session for the entire create/lock/update/unlock/activate workflow
2. **Update session state immediately** - Always update `session_state` right after each operation
3. **Store session in variables** - Keep `session_id` and `session_state` in clearly named variables
4. **Error handling** - Always unlock in finally blocks, even if session expires
5. **Logging** - Log `session_id` (first 8 chars) for debugging: `session_id[:8]`

## Related Documentation

- [Stateful Session Guide](../../architecture/STATEFUL_SESSION_GUIDE.md) - Technical details on session implementation
- [Creating Classes](./CREATING_CLASSES.md) - Example workflow using sessions
- [Common Patterns](./COMMON_PATTERNS.md) - Reusable patterns with sessions

