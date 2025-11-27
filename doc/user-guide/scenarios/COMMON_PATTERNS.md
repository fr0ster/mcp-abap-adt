# Common Patterns for Low-Level Handlers

This document provides reusable patterns and templates for working with different ABAP object types using low-level handlers.

## Generic Create-Lock-Update-Unlock-Activate Pattern

This pattern applies to most ABAP objects: Classes, Interfaces, Programs, Tables, Structures, Views, etc.

### Pattern Structure

```python
# 1. Get Session
session = get_session()
session_id = session["session_id"]
session_state = session["session_state"]

try:
    # 2. Validate
    validation = validate_object(
        object_name="Z_OBJECT_NAME",
        package_name="ZOK_LOCAL",
        session_id=session_id,
        session_state=session_state
    )
    if not validation["validation_result"]["valid"]:
        raise Error(f"Validation failed: {validation['validation_result']['message']}")
    session_state = validation["session_state"]
    
    # 3. Create
    create_result = create_object(
        object_name="Z_OBJECT_NAME",
        description="Description",
        package_name="ZOK_LOCAL",
        session_id=session_id,
        session_state=session_state
    )
    session_state = create_result["session_state"]
    
    # 4. Lock
    lock_result = lock_object(
        object_name="Z_OBJECT_NAME",
        session_id=session_id,
        session_state=session_state
    )
    lock_handle = lock_result["lock_handle"]
    # CRITICAL: Save session_id and session_state from Lock response
    # These MUST be used in Update and Unlock operations
    lock_session_id = lock_result["session_id"]
    lock_session_state = lock_result["session_state"]
    
    try:
        # 5. Update
        # CRITICAL: Use session_id and session_state from Lock response
        update_result = update_object(
            object_name="Z_OBJECT_NAME",
            source_code="...",  # or metadata, depending on object type
            lock_handle=lock_handle,
            session_id=lock_session_id,  # ← From Lock response
            session_state=lock_session_state  # ← From Lock response
        )
        session_state = update_result["session_state"]
        
    finally:
        # 6. Unlock
        # CRITICAL: Use session_id and session_state from Lock response
        unlock_result = unlock_object(
            object_name="Z_OBJECT_NAME",
            lock_handle=lock_handle,
            session_id=lock_session_id,  # ← From Lock response
            session_state=lock_session_state  # ← From Lock response
        )
        session_state = unlock_result["session_state"]
    
    # 7. Activate
    activate_result = activate_object(
        object_name="Z_OBJECT_NAME",
        session_id=session_id,
        session_state=session_state
    )
    
    print("✅ Object created and activated successfully!")
    
except Error as e:
    print(f"❌ Error: {e}")
    # Always unlock on error
    if 'lock_handle' in locals() and 'lock_session_id' in locals() and 'lock_session_state' in locals():
        try:
            unlock_object(
                object_name="Z_OBJECT_NAME",
                lock_handle=lock_handle,
                session_id=lock_session_id,  # ← From Lock response
                session_state=lock_session_state  # ← From Lock response
            )
        except:
            pass
```

## Object-Specific Patterns

### Pattern 1: Creating Classes

```python
def create_class_with_source(class_name, package_name, source_code):
    session = get_session()
    session_id = session["session_id"]
    session_state = session["session_state"]
    
    try:
        # Validate
        validation = validate_class_low(
            class_name=class_name,
            package_name=package_name,
            session_id=session_id,
            session_state=session_state
        )
        if not validation["validation_result"]["valid"]:
            raise Error(f"Validation failed: {validation['validation_result']['message']}")
        session_state = validation["session_state"]
        
        # Create
        create_result = create_class_low(
            class_name=class_name,
            description="Auto-generated class",
            package_name=package_name,
            session_id=session_id,
            session_state=session_state
        )
        session_state = create_result["session_state"]
        
        # Lock
        lock_result = lock_class_low(
            class_name=class_name,
            session_id=session_id,
            session_state=session_state
        )
        lock_handle = lock_result["lock_handle"]
        # CRITICAL: Save session_id and session_state from Lock response
        lock_session_id = lock_result["session_id"]
        lock_session_state = lock_result["session_state"]
        
        try:
            # Update
            # CRITICAL: Use session from Lock response
            update_result = update_class_low(
                class_name=class_name,
                source_code=source_code,
                lock_handle=lock_handle,
                session_id=lock_session_id,  # ← From Lock response
                session_state=lock_session_state  # ← From Lock response
            )
            session_state = update_result["session_state"]
        finally:
            # Unlock
            # CRITICAL: Use session from Lock response
            unlock_result = unlock_class_low(
                class_name=class_name,
                lock_handle=lock_handle,
                session_id=lock_session_id,  # ← From Lock response
                session_state=lock_session_state  # ← From Lock response
            )
            session_state = unlock_result["session_state"]
        
        # Activate
        activate_result = activate_class_low(
            class_name=class_name,
            session_id=session_id,
            session_state=session_state
        )
        
        return {"success": True, "class_name": class_name}
        
    except Error as e:
        if 'lock_handle' in locals() and 'lock_session_id' in locals() and 'lock_session_state' in locals():
            try:
                unlock_class_low(
                    class_name=class_name,
                    lock_handle=lock_handle,
                    session_id=lock_session_id,  # ← From Lock response
                    session_state=lock_session_state  # ← From Lock response
                )
            except:
                pass
        raise
```

### Pattern 2: Creating CDS Views

```python
def create_cds_view(view_name, package_name, ddl_source):
    session = get_session()
    session_id = session["session_id"]
    session_state = session["session_state"]
    
    try:
        # Validate
        validation = validate_view_low(
            view_name=view_name,
            package_name=package_name,
            session_id=session_id,
            session_state=session_state
        )
        if not validation["validation_result"]["valid"]:
            raise Error(f"Validation failed: {validation['validation_result']['message']}")
        session_state = validation["session_state"]
        
        # Create
        create_result = create_view_low(
            view_name=view_name,
            description="Auto-generated CDS view",
            package_name=package_name,
            session_id=session_id,
            session_state=session_state
        )
        session_state = create_result["session_state"]
        
        # Lock
        lock_result = lock_view_low(
            view_name=view_name,
            session_id=session_id,
            session_state=session_state
        )
        lock_handle = lock_result["lock_handle"]
        # CRITICAL: Save session_id and session_state from Lock response
        lock_session_id = lock_result["session_id"]
        lock_session_state = lock_result["session_state"]
        
        try:
            # Update (DDL source)
            # CRITICAL: Use session from Lock response
            update_result = update_view_low(
                view_name=view_name,
                source_code=ddl_source,
                lock_handle=lock_handle,
                session_id=lock_session_id,  # ← From Lock response
                session_state=lock_session_state  # ← From Lock response
            )
            session_state = update_result["session_state"]
        finally:
            # Unlock
            # CRITICAL: Use session from Lock response
            unlock_result = unlock_view_low(
                view_name=view_name,
                lock_handle=lock_handle,
                session_id=lock_session_id,  # ← From Lock response
                session_state=lock_session_state  # ← From Lock response
            )
            session_state = unlock_result["session_state"]
        
        # Activate
        activate_result = activate_view_low(
            view_name=view_name,
            session_id=session_id,
            session_state=session_state
        )
        
        return {"success": True, "view_name": view_name}
        
    except Error as e:
        if 'lock_handle' in locals() and 'lock_session_id' in locals() and 'lock_session_state' in locals():
            try:
                unlock_view_low(
                    view_name=view_name,
                    lock_handle=lock_handle,
                    session_id=lock_session_id,  # ← From Lock response
                    session_state=lock_session_state  # ← From Lock response
                )
            except:
                pass
        raise
```

### Pattern 3: Creating Function Groups with Function Modules

```python
def create_function_group_with_module(fg_name, fm_name, package_name, fm_source):
    session = get_session()
    session_id = session["session_id"]
    session_state = session["session_state"]
    
    try:
        # Validate Function Group
        validation = validate_function_group_low(
            function_group_name=fg_name,
            package_name=package_name,
            session_id=session_id,
            session_state=session_state
        )
        if not validation["validation_result"]["valid"]:
            raise Error(f"Validation failed: {validation['validation_result']['message']}")
        session_state = validation["session_state"]
        
        # Create Function Group
        create_result = create_function_group_low(
            function_group_name=fg_name,
            description="Auto-generated function group",
            package_name=package_name,
            session_id=session_id,
            session_state=session_state
        )
        session_state = create_result["session_state"]
        
        # Lock Function Group
        fg_lock_result = lock_function_group_low(
            function_group_name=fg_name,
            session_id=session_id,
            session_state=session_state
        )
        fg_lock_handle = fg_lock_result["lock_handle"]
        session_state = fg_lock_result["session_state"]
        
        try:
            # Create Function Module
            fm_create_result = create_function_module_low(
                function_module_name=fm_name,
                function_group_name=fg_name,
                description="Auto-generated function module",
                package_name=package_name,
                session_id=session_id,
                session_state=session_state
            )
            session_state = fm_create_result["session_state"]
            
            # Lock Function Module
            fm_lock_result = lock_function_module_low(
                function_module_name=fm_name,
                session_id=session_id,
                session_state=session_state
            )
            fm_lock_handle = fm_lock_result["lock_handle"]
            session_state = fm_lock_result["session_state"]
            
            try:
                # Update Function Module
                fm_update_result = update_function_module_low(
                    function_module_name=fm_name,
                    source_code=fm_source,
                    lock_handle=fm_lock_handle,
                    session_id=session_id,
                    session_state=session_state
                )
                session_state = fm_update_result["session_state"]
            finally:
                # Unlock Function Module
                unlock_function_module_low(
                    function_module_name=fm_name,
                    lock_handle=fm_lock_handle,
                    session_id=session_id,
                    session_state=session_state
                )
                session_state = unlock_result["session_state"]
        
        finally:
            # Unlock Function Group
            unlock_function_group_low(
                function_group_name=fg_name,
                lock_handle=fg_lock_handle,
                session_id=session_id,
                session_state=session_state
            )
            session_state = unlock_result["session_state"]
        
        # Activate Function Group
        activate_result = activate_function_group_low(
            function_group_name=fg_name,
            session_id=session_id,
            session_state=session_state
        )
        
        return {"success": True, "function_group": fg_name, "function_module": fm_name}
        
    except Error as e:
        # Unlock both if locked
        if 'fm_lock_handle' in locals():
            try:
                unlock_function_module_low(
                    function_module_name=fm_name,
                    lock_handle=fm_lock_handle,
                    session_id=session_id,
                    session_state=session_state
                )
            except:
                pass
        if 'fg_lock_handle' in locals():
            try:
                unlock_function_group_low(
                    function_group_name=fg_name,
                    lock_handle=fg_lock_handle,
                    session_id=session_id,
                    session_state=session_state
                )
            except:
                pass
        raise
```

## Error Handling Patterns

### Pattern: Safe Unlock Wrapper

```python
def safe_unlock(object_type, object_name, lock_handle, session_id, session_state):
    """Safely unlock an object, ignoring errors."""
    try:
        if object_type == "class":
            unlock_class_low(
                class_name=object_name,
                lock_handle=lock_handle,
                session_id=session_id,
                session_state=session_state
            )
        elif object_type == "view":
            unlock_view_low(
                view_name=object_name,
                lock_handle=lock_handle,
                session_id=session_id,
                session_state=session_state
            )
        # ... other object types
    except:
        pass  # Ignore unlock errors
```

### Pattern: Retry on Session Expiry

```python
def execute_with_retry(operation, max_retries=3):
    """Execute an operation with retry on session expiry."""
    for attempt in range(max_retries):
        try:
            return operation()
        except SessionExpiredError:
            if attempt < max_retries - 1:
                # Get new session and retry
                session = get_session()
                # Update session in operation context
                continue
            else:
                raise
```

## Session Management Patterns

### Pattern: Session Context Manager

```python
class SessionContext:
    """Context manager for session lifecycle."""
    
    def __init__(self):
        self.session_id = None
        self.session_state = None
    
    def __enter__(self):
        session = get_session()
        self.session_id = session["session_id"]
        self.session_state = session["session_state"]
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        # Cleanup if needed
        pass
    
    def update_state(self, new_state):
        """Update session state from operation result."""
        self.session_state = new_state

# Usage
with SessionContext() as session:
    lock_result = lock_class_low(
        class_name="ZCL_TEST",
        session_id=session.session_id,
        session_state=session.session_state
    )
    # CRITICAL: Save session from Lock response
    lock_session_id = lock_result["session_id"]
    lock_session_state = lock_result["session_state"]
    
    # Use lock_session_id and lock_session_state for Update and Unlock
    update_result = update_class_low(
        class_name="ZCL_TEST",
        source_code="...",
        lock_handle=lock_result["lock_handle"],
        session_id=lock_session_id,  # ← From Lock response
        session_state=lock_session_state  # ← From Lock response
    )
```

## Validation Patterns

### Pattern: Validate Before Create

```python
def validate_and_create(object_type, object_name, package_name, session_id, session_state):
    """Validate object name before creating."""
    validation_handler = {
        "class": validate_class_low,
        "view": validate_view_low,
        "function_group": validate_function_group_low,
        # ... other types
    }
    
    validate_func = validation_handler.get(object_type)
    if not validate_func:
        raise Error(f"Unknown object type: {object_type}")
    
    validation = validate_func(
        object_name=object_name,
        package_name=package_name,
        session_id=session_id,
        session_state=session_state
    )
    
    if not validation["validation_result"]["valid"]:
        error_msg = validation["validation_result"].get("message", "Validation failed")
        if validation["validation_result"].get("exists"):
            raise ObjectExistsError(f"{object_type} {object_name} already exists: {error_msg}")
        else:
            raise ValidationError(f"Invalid {object_type} name {object_name}: {error_msg}")
    
    return validation["session_state"]
```

## Batch Operations Pattern

### Pattern: Create Multiple Objects in Same Session

```python
def create_multiple_objects(objects, package_name):
    """Create multiple objects using the same session."""
    session = get_session()
    session_id = session["session_id"]
    session_state = session["session_state"]
    
    results = []
    
    try:
        for obj in objects:
            obj_type = obj["type"]
            obj_name = obj["name"]
            obj_source = obj.get("source_code")
            
            # Validate
            session_state = validate_and_create(
                object_type=obj_type,
                object_name=obj_name,
                package_name=package_name,
                session_id=session_id,
                session_state=session_state
            )
            
            # Create
            create_result = create_object_by_type(
                obj_type, obj_name, package_name,
                session_id, session_state
            )
            session_state = create_result["session_state"]
            
            # If source code provided, lock, update, unlock, activate
            if obj_source:
                lock_result = lock_object_by_type(
                    obj_type, obj_name, session_id, session_state
                )
                lock_handle = lock_result["lock_handle"]
                # CRITICAL: Save session from Lock response
                lock_session_id = lock_result["session_id"]
                lock_session_state = lock_result["session_state"]
                
                try:
                    # CRITICAL: Use session from Lock response
                    update_result = update_object_by_type(
                        obj_type, obj_name, obj_source,
                        lock_handle, lock_session_id, lock_session_state  # ← From Lock response
                    )
                    session_state = update_result["session_state"]
                finally:
                    # CRITICAL: Use session from Lock response
                    unlock_result = unlock_object_by_type(
                        obj_type, obj_name, lock_handle,
                        lock_session_id, lock_session_state  # ← From Lock response
                    )
                    session_state = unlock_result["session_state"]
                
                activate_result = activate_object_by_type(
                    obj_type, obj_name, session_id, session_state
                )
                session_state = activate_result["session_state"]
            
            results.append({"type": obj_type, "name": obj_name, "success": True})
    
    except Error as e:
        # Handle errors
        results.append({"error": str(e)})
    
    return results
```

## Related Documentation

- [Creating Classes](./CREATING_CLASSES.md) - Detailed class creation workflow
- [Creating CDS Views](./CREATING_CDS_VIEWS.md) - Detailed CDS view creation workflow
- [Creating Function Groups](./CREATING_FUNCTION_GROUPS.md) - Detailed function group workflow
- [Session Management](./SESSION_MANAGEMENT.md) - Understanding sessions

