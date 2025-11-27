# Creating Function Groups with Low-Level Handlers

This guide demonstrates how to create a function group and add function modules using low-level MCP handlers.

## Overview

Function groups require a slightly different workflow than classes:

```
GetSession → ValidateFunctionGroup → CreateFunctionGroup → LockFunctionGroup → 
CreateFunctionModule → UpdateFunctionModule → UnlockFunctionGroup → ActivateFunctionGroup
```

**Note**: Function groups cannot be updated directly - you add function modules to them instead.

## Step-by-Step Workflow

### Step 1: Get Session

Obtain a session ID and session state.

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
    "cookies": "SAP_SESSIONID_E19_100=xyz...",
    "csrf_token": "AbCdEf123456",
    "cookie_store": {}
  }
}
```

---

### Step 2: Validate Function Group Name

Check if the function group name is valid and available.

**Tool**: `ValidateFunctionGroupLow`

**Request**:
```json
{
  "function_group_name": "ZFG_MY_GROUP",
  "package_name": "ZOK_LOCAL",
  "description": "Test function group",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  }
}
```

**Response** (Success):
```json
{
  "success": true,
  "function_group_name": "ZFG_MY_GROUP",
  "validation_result": {
    "valid": true
  },
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  }
}
```

---

### Step 3: Create Function Group

Create the function group structure.

**Tool**: `CreateFunctionGroupLow`

**Request**:
```json
{
  "function_group_name": "ZFG_MY_GROUP",
  "description": "Test function group for demonstration",
  "package_name": "ZOK_LOCAL",
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
  "function_group_name": "ZFG_MY_GROUP",
  "package_name": "ZOK_LOCAL",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  },
  "message": "Function group ZFG_MY_GROUP created successfully..."
}
```

**Note**: Function groups are created empty. You add function modules to them in the next steps.

---

### Step 4: Lock Function Group

Acquire an exclusive lock on the function group.

**Tool**: `LockFunctionGroupLow`

**Request**:
```json
{
  "function_group_name": "ZFG_MY_GROUP",
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
  "function_group_name": "ZFG_MY_GROUP",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "lock_handle": "BD53F3688D0F164CA3ADF06FD43C39E1CC1C3B32",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  }
}
```

**CRITICAL**: 
- Save `lock_handle` - it's required for Unlock operation
- **Save `session_id` and `session_state` from this response** - they MUST be used in Unlock operation
- **Lock and Unlock MUST use the same session** - use the `session_id` and `session_state` from this Lock response

---

### Step 5: Create Function Module

Create a function module within the locked function group.

**Tool**: `CreateFunctionModuleLow`

**Request**:
```json
{
  "function_module_name": "ZFM_TEST_FUNCTION",
  "function_group_name": "ZFG_MY_GROUP",
  "description": "Test function module",
  "package_name": "ZOK_LOCAL",
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
  "function_module_name": "ZFM_TEST_FUNCTION",
  "function_group_name": "ZFG_MY_GROUP",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  },
  "message": "Function module ZFM_TEST_FUNCTION created successfully..."
}
```

---

### Step 6: Lock Function Module

Lock the function module to add source code.

**Tool**: `LockFunctionModuleLow`

**Request**:
```json
{
  "function_module_name": "ZFM_TEST_FUNCTION",
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
  "function_module_name": "ZFM_TEST_FUNCTION",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "lock_handle": "A1B2C3D4E5F6789012345678901234567890ABCD",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  }
}
```

**CRITICAL**: 
- Function modules have their own lock handle, separate from the function group lock
- **Save `session_id` and `session_state` from this response** - they MUST be used in Update and Unlock operations for this function module
- **Lock, Update, and Unlock for function module MUST use the same session** - use the `session_id` and `session_state` from this Lock response

---

### Step 7: Update Function Module

Add source code to the function module.

**Tool**: `UpdateFunctionModuleLow`

**Request**:
```json
{
  "function_module_name": "ZFM_TEST_FUNCTION",
  "source_code": "FUNCTION zfm_test_function.\n*\"----------------------------------------------------------------------\n*\"*\"Local Interface:\n*\"  IMPORTING\n*\"     VALUE(IV_INPUT) TYPE STRING\n*\"  EXPORTING\n*\"     VALUE(EV_OUTPUT) TYPE STRING\n*\"----------------------------------------------------------------------\n\n  ev_output = |Hello from { iv_input }|.\n\nENDFUNCTION.",
  "lock_handle": "A1B2C3D4E5F6789012345678901234567890ABCD",
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
  "function_module_name": "ZFM_TEST_FUNCTION",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  },
  "message": "Function module ZFM_TEST_FUNCTION updated successfully..."
}
```

---

### Step 8: Unlock Function Module

Release the lock on the function module.

**Tool**: `UnlockFunctionModuleLow`

**Request**:
```json
{
  "function_module_name": "ZFM_TEST_FUNCTION",
  "lock_handle": "A1B2C3D4E5F6789012345678901234567890ABCD",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  }
}
```

---

### Step 9: Unlock Function Group

Release the lock on the function group.

**Tool**: `UnlockFunctionGroupLow`

**Request**:
```json
{
  "function_group_name": "ZFG_MY_GROUP",
  "lock_handle": "BD53F3688D0F164CA3ADF06FD43C39E1CC1C3B32",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  }
}
```

---

### Step 10: Activate Function Group

Activate the function group (this also activates all function modules within it).

**Tool**: `ActivateFunctionGroupLow`

**Request**:
```json
{
  "function_group_name": "ZFG_MY_GROUP",
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
  "function_group_name": "ZFG_MY_GROUP",
  "activation_result": {
    "status": "success",
    "warnings": [],
    "errors": []
  },
  "message": "Function group ZFG_MY_GROUP activated successfully"
}
```

---

## Complete Example

```python
# Step 1: Get Session
session = get_session()
session_id = session["session_id"]
session_state = session["session_state"]

try:
    # Step 2: Validate Function Group
    validation = validate_function_group(
        function_group_name="ZFG_MY_GROUP",
        package_name="ZOK_LOCAL",
        session_id=session_id,
        session_state=session_state
    )
    if not validation["validation_result"]["valid"]:
        raise Error(f"Validation failed: {validation['validation_result']['message']}")
    session_state = validation["session_state"]
    
    # Step 3: Create Function Group
    create_result = create_function_group(
        function_group_name="ZFG_MY_GROUP",
        description="Test function group",
        package_name="ZOK_LOCAL",
        session_id=session_id,
        session_state=session_state
    )
    session_state = create_result["session_state"]
    
    # Step 4: Lock Function Group
    lock_result = lock_function_group(
        function_group_name="ZFG_MY_GROUP",
        session_id=session_id,
        session_state=session_state
    )
    fg_lock_handle = lock_result["lock_handle"]
    # CRITICAL: Save session_id and session_state from Lock response
    # These MUST be used in Unlock operation
    fg_lock_session_id = lock_result["session_id"]
    fg_lock_session_state = lock_result["session_state"]
    
    try:
        # Step 5: Create Function Module
        fm_create_result = create_function_module(
            function_module_name="ZFM_TEST_FUNCTION",
            function_group_name="ZFG_MY_GROUP",
            description="Test function module",
            package_name="ZOK_LOCAL",
            session_id=session_id,
            session_state=session_state
        )
        session_state = fm_create_result["session_state"]
        
        # Step 6: Lock Function Module
        fm_lock_result = lock_function_module(
            function_module_name="ZFM_TEST_FUNCTION",
            session_id=session_id,
            session_state=session_state
        )
        fm_lock_handle = fm_lock_result["lock_handle"]
        # CRITICAL: Save session_id and session_state from Lock response
        # These MUST be used in Update and Unlock operations
        fm_lock_session_id = fm_lock_result["session_id"]
        fm_lock_session_state = fm_lock_result["session_state"]
        
        try:
            # Step 7: Update Function Module
            fm_source = """FUNCTION zfm_test_function.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(IV_INPUT) TYPE STRING
*"  EXPORTING
*"     VALUE(EV_OUTPUT) TYPE STRING
*"----------------------------------------------------------------------

  ev_output = |Hello from { iv_input }|.

ENDFUNCTION."""
            
            # CRITICAL: Use session_id and session_state from Lock response
            fm_update_result = update_function_module(
                function_module_name="ZFM_TEST_FUNCTION",
                source_code=fm_source,
                lock_handle=fm_lock_handle,
                session_id=fm_lock_session_id,  # ← From Lock response
                session_state=fm_lock_session_state  # ← From Lock response
            )
            session_state = fm_update_result["session_state"]
            
        finally:
            # Step 8: Unlock Function Module
            # CRITICAL: Use session_id and session_state from Lock response
            unlock_function_module(
                function_module_name="ZFM_TEST_FUNCTION",
                lock_handle=fm_lock_handle,
                session_id=fm_lock_session_id,  # ← From Lock response
                session_state=fm_lock_session_state  # ← From Lock response
            )
            session_state = unlock_result["session_state"]
        
    finally:
        # Step 9: Unlock Function Group
        # CRITICAL: Use session_id and session_state from Lock response
        unlock_result = unlock_function_group(
            function_group_name="ZFG_MY_GROUP",
            lock_handle=fg_lock_handle,
            session_id=fg_lock_session_id,  # ← From Lock response
            session_state=fg_lock_session_state  # ← From Lock response
        )
        session_state = unlock_result["session_state"]
    
    # Step 10: Activate Function Group
    activate_result = activate_function_group(
        function_group_name="ZFG_MY_GROUP",
        session_id=session_id,
        session_state=session_state
    )
    
    print("✅ Function group and function module created and activated successfully!")
    
except Error as e:
    print(f"❌ Error: {e}")
    # Unlock both function module and function group if locked
    if 'fm_lock_handle' in locals():
        try:
            unlock_function_module(
                function_module_name="ZFM_TEST_FUNCTION",
                lock_handle=fm_lock_handle,
                session_id=session_id,
                session_state=session_state
            )
        except:
            pass
    if 'fg_lock_handle' in locals():
        try:
            unlock_function_group(
                function_group_name="ZFG_MY_GROUP",
                lock_handle=fg_lock_handle,
                session_id=session_id,
                session_state=session_state
            )
        except:
            pass
```

## Function Module Source Code Format

Function modules use standard ABAP function syntax:

```abap
FUNCTION zfm_test_function.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(IV_INPUT) TYPE STRING
*"  EXPORTING
*"     VALUE(EV_OUTPUT) TYPE STRING
*"  CHANGING
*"     VALUE(CV_VALUE) TYPE STRING OPTIONAL
*"  TABLES
*"     IT_TABLE TYPE TABLE_TYPE OPTIONAL
*"----------------------------------------------------------------------

  ev_output = |Hello from { iv_input }|.

ENDFUNCTION.
```

## Important Notes

1. **Function groups cannot be updated directly** - You add function modules to them
2. **Two-level locking** - Function group and function module have separate locks
3. **Activation** - Activating the function group activates all function modules within it
4. **Lock order** - Lock function group first, then create/lock/update/unlock function modules, then unlock function group

## Common Errors

### Error: "Function group already exists"
- **Solution**: Delete the existing function group or choose a different name

### Error: "Function module must belong to a function group"
- **Solution**: Ensure the function group is created and locked before creating function modules

### Error: "Invalid lock handle"
- **Solution**: 
  - **CRITICAL**: You MUST use the `session_id` and `session_state` from the Lock response in Update and Unlock operations
  - Lock, Update, and Unlock MUST be in the same session
  - Always save `session_id` and `session_state` from Lock response and pass them to Update and Unlock
  - Use the correct lock handle for each operation (function group vs function module)

## Best Practices

1. **Lock function group first** - Lock the function group before creating function modules
2. **Unlock in reverse order** - Unlock function modules before unlocking the function group
3. **Handle errors carefully** - Unlock both function module and function group in error handlers
4. **Activate after unlock** - Activate the function group after all unlocks are complete

## Related Tools

- `GetSession` - Get session ID and state
- `ValidateFunctionGroupLow` - Validate function group name
- `CreateFunctionGroupLow` - Create function group
- `LockFunctionGroupLow` - Lock function group
- `CreateFunctionModuleLow` - Create function module
- `LockFunctionModuleLow` - Lock function module
- `UpdateFunctionModuleLow` - Update function module source
- `UnlockFunctionModuleLow` - Unlock function module
- `UnlockFunctionGroupLow` - Unlock function group
- `ActivateFunctionGroupLow` - Activate function group

## See Also

- [Creating Classes](./CREATING_CLASSES.md) - Similar workflow for classes
- [Session Management](./SESSION_MANAGEMENT.md) - Understanding sessions
- [Common Patterns](./COMMON_PATTERNS.md) - Reusable patterns

