# Technical Debt: Generic Object Handlers

## Problem

Currently we have several "generic" handlers that violate the Single Responsibility Principle (SRP):

- `handleActivateObject` - activates any object type via switch/case
- `handleDeleteObject` - deletes any object type (needs switch/case implementation)
- `handleLockObject` - locks any object type via switch/case
- `handleUnlockObject` - unlocks any object type via switch/case

These handlers accept `object_type` parameter and use switch statements to dispatch to the appropriate CrudClient method.

## Why This Is Technical Debt

1. **Violates SRP** - each handler handles multiple object types instead of one
2. **Poor discoverability** - users must know exact object_type strings
3. **Inconsistent with other handlers** - we have specific handlers like `handleCreateClass` (in `class/`), `handleUpdateProgram` (in `program/`), but generic `handleDeleteObject` (in `common/`)
4. **Maintenance burden** - adding new object types requires updating multiple switch statements
5. **Poor type safety** - generic handlers have complex conditional logic

## Correct Architecture

Each object type should have its own dedicated handlers:

### Instead of:
```
handleDeleteObject(object_type: "class" | "program" | ...)
handleActivateObject(object_type: "class" | "program" | ...)
handleLockObject(object_type: "class" | "program" | ...)
```

### Should be:
```
handleDeleteClass()
handleDeleteProgram()
handleDeleteTable()
...
handleActivateClass()
handleActivateProgram()
...
handleLockClass()
handleLockProgram()
...
```

## Critical Issue: Delete Functionality Not Implemented

**DELETE METHODS MISSING IN CrudClient:**
- `deleteClass()` - not implemented
- `deleteProgram()` - not implemented  
- `deleteTable()` - not implemented
- etc.

The `handleDeleteObject` handler currently calls `crudClient.deleteObject()` which **DOES NOT EXIST** in adt-clients.

**Impact:** Delete functionality is completely broken in mcp-abap-adt.

**Required work:**
1. Implement delete methods in adt-clients CrudClient (12 object types × deleteX methods)
2. Then refactor handleDeleteObject to use switch/case OR split into object-specific handlers

## Current Status

**Temporary solution implemented:**
- Generic handlers kept but use switch/case to dispatch to CrudClient methods
- **EXCEPTION:** handleDeleteObject is broken - CrudClient has no delete methods
- All use the new CrudClient API (no direct Builder usage)
- Marked as technical debt in this document

**What needs to be done:**
1. Create specific handlers for each object type (40+ new files)
2. Update toolsRegistry.ts to register specific handlers
3. Mark generic handlers as deprecated
4. Remove generic handlers after transition period
5. Update documentation and examples

## Estimated Effort

- **10 object types** × **4 operations** (delete, activate, lock, unlock) = **40 new handlers**
- Plus toolsRegistry updates, tests, documentation
- Total: ~2-3 days of work

## Priority

**Medium** - current solution works but should be refactored when time permits.

Not blocking release, but should be addressed in next major version.

## Related Files

- `/src/handlers/common/handleActivateObject.ts`
- `/src/handlers/common/handleDeleteObject.ts`
- `/src/handlers/common/handleLockObject.ts`
- `/src/handlers/common/handleUnlockObject.ts`
- `/src/lib/toolsRegistry.ts`

## Decision Log

**2025-11-21**: Decision to keep generic handlers temporarily with switch/case implementation
- Focus on other critical issues (env file location, help command, release testing)
- Will refactor to specific handlers in future version
- All handlers now use CrudClient instead of Builders (completed)
