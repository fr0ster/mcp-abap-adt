# Creating ABAP Classes with Low-Level Handlers

This guide demonstrates how to create an ABAP class using low-level MCP handlers, including validation, creation, locking, updating source code, unlocking, and activation.

## Overview

The complete workflow for creating a class with source code:

```
GetSession → ValidateClass → CreateClass → LockClass → UpdateClass → UnlockClass → ActivateClass
```

## Step-by-Step Workflow

### Step 1: Get Session

First, obtain a session ID and session state that will be reused across all operations.

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
    "cookies": "SAP_SESSIONID_E19_100=xyz...; sap-usercontext=...",
    "csrf_token": "AbCdEf123456",
    "cookie_store": {}
  },
  "message": "Session ID generated. Use this session_id in subsequent requests..."
}
```

**Important**: Save `session_id` and `session_state` for all subsequent operations.

---

### Step 2: Validate Class Name

Check if the class name is valid and available.

**Tool**: `ValidateClassLow`

**Request**:
```json
{
  "class_name": "ZCL_MY_TEST_CLASS",
  "package_name": "ZOK_LOCAL",
  "description": "Test class for demonstration",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "SAP_SESSIONID_E19_100=xyz...",
    "csrf_token": "AbCdEf123456",
    "cookie_store": {}
  }
}
```

**Response** (Success):
```json
{
  "success": true,
  "class_name": "ZCL_MY_TEST_CLASS",
  "validation_result": {
    "valid": true
  },
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  }
}
```

**Response** (Name Already Exists):
```json
{
  "success": false,
  "validation_result": {
    "valid": false,
    "severity": "ERROR",
    "message": "Class ZCL_MY_TEST_CLASS already exists",
    "exists": true
  }
}
```

**Important**: If validation fails, choose a different name or delete the existing class first.

---

### Step 3: Create Class

Create the class structure (without source code yet).

**Tool**: `CreateClassLow`

**Request**:
```json
{
  "class_name": "ZCL_MY_TEST_CLASS",
  "description": "Test class for demonstration",
  "package_name": "ZOK_LOCAL",
  "superclass": "",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "SAP_SESSIONID_E19_100=xyz...",
    "csrf_token": "AbCdEf123456",
    "cookie_store": {}
  }
}
```

**Response**:
```json
{
  "success": true,
  "class_name": "ZCL_MY_TEST_CLASS",
  "package_name": "ZOK_LOCAL",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  },
  "message": "Class ZCL_MY_TEST_CLASS created successfully..."
}
```

**Important**: Update `session_state` from the response for subsequent operations.

---

### Step 4: Lock Class

Acquire an exclusive lock on the class for modification.

**Tool**: `LockClassLow`

**Request**:
```json
{
  "class_name": "ZCL_MY_TEST_CLASS",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  }
}
```

**Response**:
```json
{
  "success": true,
  "class_name": "ZCL_MY_TEST_CLASS",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "lock_handle": "BD53F3688D0F164CA3ADF06FD43C39E1CC1C3B32",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  },
  "message": "Class ZCL_MY_TEST_CLASS locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations."
}
```

**CRITICAL**: 
- Save `lock_handle` - it's required for Update and Unlock operations
- **Save `session_id` and `session_state` from this response** - they MUST be used in Update and Unlock operations
- **Lock, Update, and Unlock MUST use the same session** - use the `session_id` and `session_state` from this Lock response

---

### Step 5: Update Class Source Code

Add or modify the class source code.

**Tool**: `UpdateClassLow`

**Request**:
```json
{
  "class_name": "ZCL_MY_TEST_CLASS",
  "source_code": "CLASS zcl_my_test_class DEFINITION\n  PUBLIC\n  FINAL\n  CREATE PUBLIC.\n\n  PUBLIC SECTION.\n    METHODS: constructor,\n             get_message RETURNING VALUE(result) TYPE string.\nENDCLASS.\n\nCLASS zcl_my_test_class IMPLEMENTATION.\n  METHOD constructor.\n    \" Constructor implementation\n  ENDMETHOD.\n\n  METHOD get_message.\n    result = 'Hello from ZCL_MY_TEST_CLASS'.\n  ENDMETHOD.\nENDCLASS.",
  "lock_handle": "BD53F3688D0F164CA3ADF06FD43C39E1CC1C3B32",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  }
}
```

**Response**:
```json
{
  "success": true,
  "class_name": "ZCL_MY_TEST_CLASS",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  },
  "message": "Class ZCL_MY_TEST_CLASS updated successfully. Remember to unlock using UnlockClassLow."
}
```

**CRITICAL**: 
- **MUST use the same `session_id` and `session_state` from the Lock operation** - Update must be in the same session as Lock
- Source code must include both `CLASS DEFINITION` and `CLASS IMPLEMENTATION` sections
- Use `\n` for line breaks in JSON strings
- Update `session_state` from response for subsequent operations

---

### Step 6: Unlock Class

Release the lock on the class.

**Tool**: `UnlockClassLow`

**Request**:
```json
{
  "class_name": "ZCL_MY_TEST_CLASS",
  "lock_handle": "BD53F3688D0F164CA3ADF06FD43C39E1CC1C3B32",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  }
}
```

**Response**:
```json
{
  "success": true,
  "class_name": "ZCL_MY_TEST_CLASS",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  },
  "message": "Class ZCL_MY_TEST_CLASS unlocked successfully."
}
```

**CRITICAL**: 
- **MUST use the same `session_id` and `session_state` from the Lock operation** - Unlock must be in the same session as Lock and Update
- The `session_id` and `session_state` from Lock response must be passed to Unlock

**Critical**: Always unlock, even if errors occur. Use try/finally blocks in your code.

---

### Step 7: Activate Class

Activate the class to make it available for use.

**Tool**: `ActivateClassLow`

**Request**:
```json
{
  "class_name": "ZCL_MY_TEST_CLASS",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  }
}
```

**Response**:
```json
{
  "success": true,
  "class_name": "ZCL_MY_TEST_CLASS",
  "activation_result": {
    "status": "success",
    "warnings": [],
    "errors": []
  },
  "message": "Class ZCL_MY_TEST_CLASS activated successfully"
}
```

---

## Complete Example (Python-like Pseudocode)

```python
# Step 1: Get Session
session = get_session()
session_id = session["session_id"]
session_state = session["session_state"]

try:
    # Step 2: Validate
    validation = validate_class(
        class_name="ZCL_MY_TEST_CLASS",
        package_name="ZOK_LOCAL",
        session_id=session_id,
        session_state=session_state
    )
    if not validation["validation_result"]["valid"]:
        raise Error(f"Validation failed: {validation['validation_result']['message']}")
    
    # Update session state
    session_state = validation["session_state"]
    
    # Step 3: Create
    create_result = create_class(
        class_name="ZCL_MY_TEST_CLASS",
        description="Test class",
        package_name="ZOK_LOCAL",
        session_id=session_id,
        session_state=session_state
    )
    session_state = create_result["session_state"]
    
    # Step 4: Lock
    lock_result = lock_class(
        class_name="ZCL_MY_TEST_CLASS",
        session_id=session_id,
        session_state=session_state
    )
    lock_handle = lock_result["lock_handle"]
    # CRITICAL: Save session_id and session_state from Lock response
    # These MUST be used in Update and Unlock operations
    lock_session_id = lock_result["session_id"]
    lock_session_state = lock_result["session_state"]
    
    try:
        # Step 5: Update
        source_code = """CLASS zcl_my_test_class DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS: get_message RETURNING VALUE(result) TYPE string.
ENDCLASS.

CLASS zcl_my_test_class IMPLEMENTATION.
  METHOD get_message.
    result = 'Hello World'.
  ENDMETHOD.
ENDCLASS."""
        
        # CRITICAL: Use session_id and session_state from Lock response
        update_result = update_class(
            class_name="ZCL_MY_TEST_CLASS",
            source_code=source_code,
            lock_handle=lock_handle,
            session_id=lock_session_id,  # ← From Lock response
            session_state=lock_session_state  # ← From Lock response
        )
        session_state = update_result["session_state"]
        
        finally:
        # Step 6: Unlock (always execute)
        # CRITICAL: Use session_id and session_state from Lock response
        unlock_result = unlock_class(
            class_name="ZCL_MY_TEST_CLASS",
            lock_handle=lock_handle,
            session_id=lock_session_id,  # ← From Lock response
            session_state=lock_session_state  # ← From Lock response
        )
        session_state = unlock_result["session_state"]
    
    # Step 7: Activate
    activate_result = activate_class(
        class_name="ZCL_MY_TEST_CLASS",
        session_id=session_id,
        session_state=session_state
    )
    
    print("✅ Class created and activated successfully!")
    
except Error as e:
    print(f"❌ Error: {e}")
    # If lock was acquired, unlock in error handler
    if 'lock_handle' in locals():
        try:
            unlock_class(
                class_name="ZCL_MY_TEST_CLASS",
                lock_handle=lock_handle,
                session_id=session_id,
                session_state=session_state
            )
        except:
            pass
```

## Common Errors and Solutions

### Error: "Class already exists"
- **Solution**: Delete the existing class first, or choose a different name

### Error: "Invalid lock handle"
- **Solution**: 
  - **CRITICAL**: You MUST use the `session_id` and `session_state` from the Lock response in Update and Unlock operations
  - Lock, Update, and Unlock MUST be in the same session
  - Always save `session_id` and `session_state` from Lock response and pass them to Update and Unlock

### Error: "Resource is not locked"
- **Solution**: Make sure you locked the class before updating, and use the correct `lock_handle`

### Error: "Session expired"
- **Solution**: Get a new session using `GetSession` and restart the workflow

## Best Practices

1. **Always validate first** - Check if the name is available before creating
2. **Reuse session** - Use the same `session_id` and `session_state` for the entire workflow
3. **CRITICAL: Lock returns session parameters** - Always save `session_id` and `session_state` from Lock response
4. **CRITICAL: Same session for Lock-Update-Unlock** - Lock, Update, and Unlock MUST use the same `session_id` and `session_state` from Lock response
5. **Always unlock** - Use try/finally blocks to ensure unlock happens even on errors
6. **Update session state** - Always use the `session_state` from the previous response
7. **Handle errors gracefully** - Check validation results and handle errors at each step
8. **Activate after unlock** - Activate the class after unlocking (not while locked)

## Related Tools

- `GetSession` - Get session ID and state
- `ValidateClassLow` - Validate class name
- `CreateClassLow` - Create class structure
- `LockClassLow` - Lock class for modification
- `UpdateClassLow` - Update class source code
- `UnlockClassLow` - Release lock
- `ActivateClassLow` - Activate class

## See Also

- [Session Management](./SESSION_MANAGEMENT.md) - Understanding sessions in detail
- [Common Patterns](./COMMON_PATTERNS.md) - Reusable patterns for other object types
- [Stateful Session Guide](../../architecture/STATEFUL_SESSION_GUIDE.md) - Technical details

