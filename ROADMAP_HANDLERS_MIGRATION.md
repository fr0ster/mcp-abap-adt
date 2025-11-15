# Roadmap: Migration of MCP Handlers to Builders

## Current State Analysis

**⚠️ IMPORTANT**: Currently, handlers do NOT use `@mcp-abap-adt/adt-clients` package at all!
- All handlers use custom functions from `src/lib/sessionUtils.ts` and `src/lib/utils.ts`
- Direct HTTP requests via `makeAdtRequestWithSession()` 
- Manual session/lock management
- No builders or low-level functions from adt-clients package

### Handlers Using Custom Implementation (Need Migration to Builders)

#### CREATE Handlers (12 handlers) - Currently use `makeAdtRequestWithSession`
1. ✅ **handleCreateClass** → Migrated to `ClassBuilder` (uses builder chain: validate → create → lock → update → check → unlock → activate)
2. ✅ **handleCreateDomain** → Migrated to `DomainBuilder` (uses builder chain: create → activate)
3. ❌ **handleCreateDataElement** → Migrate to `DataElementBuilder` (uses custom implementation)
4. ❌ **handleCreateFunctionGroup** → Migrate to `FunctionGroupBuilder` (uses custom implementation)
5. ❌ **handleCreateFunctionModule** → Migrate to `FunctionModuleBuilder` (uses custom implementation)
6. ❌ **handleCreateProgram** → Migrate to `ProgramBuilder` (uses custom `createProgramObject`, `lockProgram`, `uploadProgramSource`, `unlockProgram`, `activateProgram`)
7. ❌ **handleCreateInterface** → Migrate to `InterfaceBuilder` (uses custom implementation)
8. ❌ **handleCreateStructure** → Migrate to `StructureBuilder` (uses custom implementation)
9. ❌ **handleCreateTable** → Migrate to `TableBuilder` (uses custom implementation)
10. ❌ **handleCreateView** → Migrate to `ViewBuilder` (uses custom implementation)
11. ❌ **handleCreatePackage** → Migrate to `PackageBuilder` (uses custom `validatePackageBasic`, `checkTransportRequirements`, `validatePackageFull`, `createPackageInternal`)
12. ❌ **handleCreateTransport** → Migrate to `TransportBuilder` (uses custom implementation)

#### UPDATE Handlers (7 handlers) - Currently use `makeAdtRequestWithSession`
1. ✅ **handleUpdateClassSource** → Migrated to `ClassBuilder` (uses builder chain: lock → update → check → unlock → activate)
2. ❌ **handleUpdateDomain** → Migrate to `DomainBuilder` (uses custom `acquireLockHandle`, `lockAndUpdateDomain`, `checkDomainSyntax`, `unlockDomain`, `activateDomain`)
3. ❌ **handleUpdateDataElement** → Migrate to `DataElementBuilder` (uses custom implementation)
4. ❌ **handleUpdateFunctionModuleSource** → Migrate to `FunctionModuleBuilder` (uses custom implementation)
5. ❌ **handleUpdateProgramSource** → Migrate to `ProgramBuilder` (uses custom implementation)
6. ❌ **handleUpdateInterfaceSource** → Migrate to `InterfaceBuilder` (uses custom implementation)
7. ❌ **handleUpdateViewSource** → Migrate to `ViewBuilder` (uses custom implementation)

#### DELETE Handlers (1 handler) - Currently use `makeAdtRequestWithSession`
1. ❌ **handleDeleteObject** → Generic handler using custom implementation
   - Supports: class, domain, dataElement, functionGroup, functionModule, program, interface, structure, table, view
   - Uses custom `makeAdtRequestWithSession` for DELETE requests
   - May need separate delete functions or generic approach with builders

#### ACTIVATE Handlers (1 handler) - Currently use custom activation
1. ❌ **handleActivateObject** → Generic handler using custom `activateObjectInSession`
   - Supports: class, domain, dataElement, functionGroup, functionModule, program, interface, structure, table, view
   - Uses custom activation XML building
   - Can migrate to builders: `.activate()` method

#### CHECK Handlers (1 handler) - Currently use custom check
1. ❌ **handleCheckObject** → Generic handler using custom implementation
   - Supports: class, domain, dataElement, functionGroup, functionModule, program, interface, structure, table, view
   - Uses custom check requests
   - Can migrate to builders: `.check()` method

### Handlers Using READ Operations (Currently use custom implementation, may benefit from adt-clients)
- handleGetClass
- handleGetDomain
- handleGetDataElement
- handleGetFunction
- handleGetFunctionGroup
- handleGetInterface
- handleGetProgram
- handleGetStructure
- handleGetTable
- handleGetView
- handleGetPackage
- handleGetTransport
- handleSearchObject
- handleGetWhereUsed
- handleGetSqlQuery
- handleGetTableContents
- etc.

## Migration Strategy

### Phase 1: CREATE Handlers (Priority: High)
**Status**: All builders available ✅

**Approach**:
- Replace manual session management with Builder pattern
- Use builder's fluent API: `validate() → create() → lock() → update() → check() → unlock() → activate()`
- Remove manual `makeAdtRequestWithSession` calls
- Simplify error handling with builder's `.catch()` and `.finally()`

**Example Migration**:
```typescript
// CURRENT (handleCreateClass.ts) - Uses custom functions
import { generateSessionId, makeAdtRequestWithSession } from '../lib/sessionUtils';
import { getBaseUrl } from '../lib/utils';

const sessionId = generateSessionId();
const createResponse = await createClassObject(args, sessionId); // Custom function
const lockHandle = await lockClass(className, sessionId); // Custom function
await uploadClassSource(className, sourceCode, lockHandle, sessionId); // Custom function
await unlockClass(className, lockHandle, sessionId); // Custom function
await activateClass(className, sessionId); // Custom function

// TARGET (using ClassBuilder from @mcp-abap-adt/adt-clients)
import { ClassBuilder } from '@mcp-abap-adt/adt-clients';
import { getManagedConnection, logger } from '../lib/utils';

// Get connection (already available via getManagedConnection)
const connection = getManagedConnection();

const builder = new ClassBuilder(connection, logger, {
  className: args.class_name,
  packageName: args.package_name,
  transportRequest: args.transport_request,
  superclass: args.superclass
});

await builder
  .setCode(args.source_code || generateMinimalClassSource(args))
  .validate()
  .then(b => b.create())
  .then(b => b.lock())
  .then(b => b.update())
  .then(b => b.check())
  .then(b => b.unlock())
  .then(b => args.activate !== false ? b.activate() : Promise.resolve(b))
  .catch(error => {
    logger.error('Class creation failed:', error);
    throw error;
  });
```

**Key Changes Required**:
1. Replace `makeAdtRequestWithSession` with builders
2. Replace custom session management with builder's internal session handling
3. Replace custom lock/unlock/activate functions with builder methods
4. Adapt connection creation (handlers use `getBaseUrl()`, builders need `AbapConnection`)
5. Remove all custom XML building (builders handle this internally)

### Phase 2: UPDATE Handlers (Priority: High)
**Status**: All builders available ✅

**Approach**:
- For source updates: `lock() → update() → check() → unlock() → activate()`
- For metadata updates: Use builder's `update()` method with new parameters
- Remove manual lock/unlock management

### Phase 3: Generic Handlers (Priority: Medium)
**Status**: Need analysis ⚠️

**Handlers**:
- `handleDeleteObject` - Generic delete for all object types
- `handleActivateObject` - Generic activation for all object types
- `handleCheckObject` - Generic syntax check for all object types

**Options**:
1. **Option A**: Create wrapper functions that use appropriate builder based on object type
2. **Option B**: Keep generic handlers but use builders internally
3. **Option C**: Split into type-specific handlers (more consistent with CREATE/UPDATE pattern)

**Recommendation**: Option B - Keep generic handlers for MCP API consistency, but refactor internals to use builders.

## Builders Coverage

### ✅ Available Builders (12/12)
- ClassBuilder
- DomainBuilder
- DataElementBuilder
- FunctionGroupBuilder
- FunctionModuleBuilder
- ProgramBuilder
- InterfaceBuilder
- StructureBuilder
- TableBuilder
- ViewBuilder
- TransportBuilder
- PackageBuilder

### ⚠️ Missing Operations
- **Delete operations**: Not all builders have `delete()` method
  - Need to check: class, domain, dataElement, functionGroup, functionModule, program, interface, structure, table, view
- **Generic operations**: Need wrapper functions for generic handlers

## Implementation Notes

### Connection Management
- **CURRENT**: Handlers use `getBaseUrl()` from `src/lib/utils.ts` and `makeAdtRequestWithSession` from `src/lib/sessionUtils.ts`
- **GOOD NEWS**: `src/lib/utils.ts` already has `getManagedConnection()` which returns `AbapConnection` from `@mcp-abap-adt/connection` package
- **TARGET**: Use `getManagedConnection()` to get connection instance for builders
- Connection is already managed and cached, so no need to create new one per handler call
- Example: `const connection = getManagedConnection();`

### Error Handling
- Builders use Promise chaining with `.catch()` and `.finally()`
- Handlers should wrap builder calls in try-catch for MCP error format
- Builder errors should be converted to `McpError` format

### Session Management
- **CURRENT**: Handlers manually manage sessions via `generateSessionId()` from `src/lib/sessionUtils.ts`
- **TARGET**: Builders handle session internally via their own `generateSessionId()`
- No need for manual session ID management in handlers after migration
- Lock handles are managed by builders internally
- **IMPORTANT**: Need to ensure builders' session management is compatible with handlers' requirements

### Transport Request Validation
- Keep `validateTransportRequest()` utility
- Call before builder operations
- Builders will use validated transport request

## Migration Checklist

### CREATE Handlers
- [x] handleCreateClass
- [x] handleCreateDomain
- [ ] handleCreateDataElement
- [ ] handleCreateFunctionGroup
- [ ] handleCreateFunctionModule
- [ ] handleCreateProgram
- [ ] handleCreateInterface
- [ ] handleCreateStructure
- [ ] handleCreateTable
- [ ] handleCreateView
- [ ] handleCreatePackage
- [ ] handleCreateTransport

### UPDATE Handlers
- [x] handleUpdateClassSource
- [ ] handleUpdateDomain
- [ ] handleUpdateDataElement
- [ ] handleUpdateFunctionModuleSource
- [ ] handleUpdateProgramSource
- [ ] handleUpdateInterfaceSource
- [ ] handleUpdateViewSource

### Generic Handlers
- [ ] handleDeleteObject (analysis needed)
- [ ] handleActivateObject (analysis needed)
- [ ] handleCheckObject (analysis needed)

## Benefits of Migration

1. **Code Simplification**: Reduce handler code by 50-70%
2. **Consistency**: All handlers use same pattern
3. **Maintainability**: Changes in builder logic automatically apply to all handlers
4. **Error Handling**: Standardized error handling via Promise chaining
5. **Testing**: Easier to test handlers (mock builders)
6. **Session Management**: Automatic session/lock handling

## Risks and Considerations

1. **Breaking Changes**: Need to ensure MCP API contract remains the same
2. **Error Messages**: Builder errors may differ from current handler errors
3. **Performance**: Builder pattern adds small overhead (negligible)
4. **Testing**: Need to test all handlers after migration

## Branch Strategy Recommendation

**Recommendation**: Create a new branch `refactor/handlers-to-builders`

**Reasoning**:
- Large refactoring affecting 20+ handlers
- Can be reviewed independently
- Easy to revert if issues found
- Can merge when SAP server is back online and tested

**Alternative**: If current branch is already a feature branch, continue there but create separate commits for each handler group.

## Current State Summary

- ✅ **All 12 builders available** in `@mcp-abap-adt/adt-clients` package
- ✅ **Connection infrastructure ready** (`getManagedConnection()` exists in `src/lib/utils.ts`)
- ✅ **3 handlers migrated to builders** (handleCreateClass, handleUpdateClassSource, handleCreateDomain)
- ❌ **18 handlers still use custom implementation** - use `makeAdtRequestWithSession` from `src/lib/`
- 📋 **18 handlers need migration**:
  - 10 CREATE handlers remaining
  - 6 UPDATE handlers remaining
  - 1 DELETE handler (generic)
  - 1 ACTIVATE handler (generic)
  - 1 CHECK handler (generic)

## Migration Progress

**Completed (3/21):**
- ✅ handleCreateClass → ClassBuilder
- ✅ handleUpdateClassSource → ClassBuilder
- ✅ handleCreateDomain → DomainBuilder

**Remaining (18/21):**
- handleCreateDataElement
- handleCreateFunctionGroup
- handleCreateFunctionModule
- handleCreateProgram
- handleCreateInterface
- handleCreateStructure
- handleCreateTable
- handleCreateView
- handleCreatePackage
- handleCreateTransport
- handleUpdateDomain
- handleUpdateDataElement
- handleUpdateFunctionModuleSource
- handleUpdateProgramSource
- handleUpdateInterfaceSource
- handleUpdateViewSource
- handleDeleteObject (generic)
- handleActivateObject (generic)
- handleCheckObject (generic)

## Migration Complexity

**High Complexity**:
- Complete rewrite of handler logic
- Need to replace all `makeAdtRequestWithSession` calls
- Need to adapt error handling to MCP format
- Need to ensure backward compatibility of MCP API

**Medium Complexity**:
- Connection already available via `getManagedConnection()`
- Builders handle session/lock management internally
- XML building handled by builders

**Low Complexity**:
- Transport validation utility can be reused
- Logger already compatible

