# Creating CDS Views with Low-Level Handlers

This guide demonstrates how to create a CDS view (DDL source) using low-level MCP handlers.

## Overview

CDS views are created as DDL source objects. The workflow is similar to classes:

```
GetSession → ValidateView → CreateView → LockView → UpdateView → UnlockView → ActivateView
```

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

### Step 2: Validate View Name

Check if the view name is valid and available.

**Tool**: `ValidateViewLow`

**Request**:
```json
{
  "view_name": "ZCDS_MY_VIEW",
  "package_name": "ZOK_LOCAL",
  "description": "Test CDS view",
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
  "view_name": "ZCDS_MY_VIEW",
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

### Step 3: Create View

Create the view structure.

**Tool**: `CreateViewLow`

**Request**:
```json
{
  "view_name": "ZCDS_MY_VIEW",
  "description": "Test CDS view for demonstration",
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
  "view_name": "ZCDS_MY_VIEW",
  "package_name": "ZOK_LOCAL",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  },
  "message": "View ZCDS_MY_VIEW created successfully..."
}
```

---

### Step 4: Lock View

Acquire an exclusive lock on the view.

**Tool**: `LockViewLow`

**Request**:
```json
{
  "view_name": "ZCDS_MY_VIEW",
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
  "view_name": "ZCDS_MY_VIEW",
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
- Save `lock_handle` - it's required for Update and Unlock operations
- **Save `session_id` and `session_state` from this response** - they MUST be used in Update and Unlock operations
- **Lock, Update, and Unlock MUST use the same session** - use the `session_id` and `session_state` from this Lock response

---

### Step 5: Update View (DDL Source)

Add the DDL source code for the CDS view.

**Tool**: `UpdateViewLow`

**Request**:
```json
{
  "view_name": "ZCDS_MY_VIEW",
  "source_code": "@AbapCatalog.viewEnhancementCategory: [#NONE]\n@AccessControl.authorizationCheck: #CHECK\n@EndUserText.label: 'My Test CDS View'\n@Metadata.ignorePropagatedAnnotations: true\n@Metadata.allowExtensions: true\n@Search.searchable: true\ndefine view entity ZCDS_MY_VIEW\n  as select from sflight\n{\n  key carrid,\n  key connid,\n  key fldate,\n      price,\n      currency,\n      planetype\n}\nwhere\n  carrid = 'LH'",
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
  "view_name": "ZCDS_MY_VIEW",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  },
  "message": "View ZCDS_MY_VIEW updated successfully..."
}
```

**CRITICAL**: 
- **MUST use the same `session_id` and `session_state` from the Lock operation** - Update must be in the same session as Lock
- DDL source must be valid CDS view syntax
- Use `\n` for line breaks in JSON strings
- Update `session_state` from response for subsequent operations

---

### Step 6: Unlock View

Release the lock.

**Tool**: `UnlockViewLow`

**Request**:
```json
{
  "view_name": "ZCDS_MY_VIEW",
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
  "view_name": "ZCDS_MY_VIEW",
  "session_id": "a1b2c3d4e5f6789012345678901234567890abcd",
  "session_state": {
    "cookies": "...",
    "csrf_token": "...",
    "cookie_store": {}
  }
}
```

---

### Step 7: Activate View

Activate the CDS view.

**Tool**: `ActivateViewLow`

**Request**:
```json
{
  "view_name": "ZCDS_MY_VIEW",
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
  "view_name": "ZCDS_MY_VIEW",
  "activation_result": {
    "status": "success",
    "warnings": [],
    "errors": []
  },
  "message": "View ZCDS_MY_VIEW activated successfully"
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
    # Step 2: Validate
    validation = validate_view(
        view_name="ZCDS_MY_VIEW",
        package_name="ZOK_LOCAL",
        session_id=session_id,
        session_state=session_state
    )
    if not validation["validation_result"]["valid"]:
        raise Error(f"Validation failed: {validation['validation_result']['message']}")
    session_state = validation["session_state"]
    
    # Step 3: Create
    create_result = create_view(
        view_name="ZCDS_MY_VIEW",
        description="Test CDS view",
        package_name="ZOK_LOCAL",
        session_id=session_id,
        session_state=session_state
    )
    session_state = create_result["session_state"]
    
    # Step 4: Lock
    lock_result = lock_view(
        view_name="ZCDS_MY_VIEW",
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
        ddl_source = """@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'My Test CDS View'
define view entity ZCDS_MY_VIEW
  as select from sflight
{
  key carrid,
  key connid,
  key fldate,
      price,
      currency
}
where
  carrid = 'LH'"""
        
        # CRITICAL: Use session_id and session_state from Lock response
        update_result = update_view(
            view_name="ZCDS_MY_VIEW",
            source_code=ddl_source,
            lock_handle=lock_handle,
            session_id=lock_session_id,  # ← From Lock response
            session_state=lock_session_state  # ← From Lock response
        )
        session_state = update_result["session_state"]
        
        finally:
        # Step 6: Unlock
        # CRITICAL: Use session_id and session_state from Lock response
        unlock_result = unlock_view(
            view_name="ZCDS_MY_VIEW",
            lock_handle=lock_handle,
            session_id=lock_session_id,  # ← From Lock response
            session_state=lock_session_state  # ← From Lock response
        )
        session_state = unlock_result["session_state"]
    
    # Step 7: Activate
    activate_result = activate_view(
        view_name="ZCDS_MY_VIEW",
        session_id=session_id,
        session_state=session_state
    )
    
    print("✅ CDS view created and activated successfully!")
    
except Error as e:
    print(f"❌ Error: {e}")
    if 'lock_handle' in locals():
        try:
            unlock_view(
                view_name="ZCDS_MY_VIEW",
                lock_handle=lock_handle,
                session_id=session_id,
                session_state=session_state
            )
        except:
            pass
```

## CDS View DDL Source Format

CDS views use DDL (Data Definition Language) syntax. Example:

```abap
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'My CDS View'
@Metadata.ignorePropagatedAnnotations: true
@Metadata.allowExtensions: true
@Search.searchable: true
define view entity ZCDS_MY_VIEW
  as select from sflight
{
  key carrid,
  key connid,
  key fldate,
      price,
      currency,
      planetype
}
where
  carrid = 'LH'
```

## Common Errors

### Error: "View already exists"
- **Solution**: Delete the existing view or choose a different name

### Error: "DDL syntax error"
- **Solution**: Validate your DDL source code syntax. Check annotations and SQL syntax.

### Error: "Invalid lock handle"
- **Solution**: 
  - **CRITICAL**: You MUST use the `session_id` and `session_state` from the Lock response in Update and Unlock operations
  - Lock, Update, and Unlock MUST be in the same session
  - Always save `session_id` and `session_state` from Lock response and pass them to Update and Unlock

## Best Practices

1. **Validate DDL syntax** - Ensure your DDL source is valid before updating
2. **Use proper annotations** - Include required annotations like `@AbapCatalog`, `@EndUserText`
3. **Test activation** - Always activate after unlock to check for syntax errors
4. **Handle errors** - Always unlock in finally blocks

## Related Tools

- `GetSession` - Get session ID and state
- `ValidateViewLow` - Validate view name
- `CreateViewLow` - Create view structure
- `LockViewLow` - Lock view for modification
- `UpdateViewLow` - Update DDL source code
- `UnlockViewLow` - Release lock
- `ActivateViewLow` - Activate view

## See Also

- [Creating Classes](./CREATING_CLASSES.md) - Similar workflow for classes
- [Session Management](./SESSION_MANAGEMENT.md) - Understanding sessions
- [Common Patterns](./COMMON_PATTERNS.md) - Reusable patterns

