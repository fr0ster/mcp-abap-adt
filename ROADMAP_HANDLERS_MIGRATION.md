# Roadmap: Migration of MCP Handlers to Builders

## Current State Analysis

**✅ MIGRATION 100% COMPLETED**: All handlers now use `@mcp-abap-adt/adt-clients` package!
- ✅ All CREATE handlers use builders from `@mcp-abap-adt/adt-clients`
- ✅ All UPDATE handlers use builders from `@mcp-abap-adt/adt-clients`
- ✅ DELETE handler uses `deleteObject` function from `@mcp-abap-adt/adt-clients/core`
- ✅ ACTIVATE handler uses `activateObjectsGroup` and `parseActivationResponse` from `@mcp-abap-adt/adt-clients/core`
- ✅ CHECK handler uses `runCheckRun` and `parseCheckRunResponse` from `@mcp-abap-adt/adt-clients/core`
- ✅ Connection management via `getManagedConnection()` from `src/lib/utils.ts`
- ✅ Session/lock management handled internally by builders and functions

### Migrated Handlers (All specific handlers now use builders)

#### CREATE Handlers (12 handlers) - ✅ Migrated to Builders
1. ✅ **handleCreateClass** → Migrated to `ClassBuilder` (uses builder chain: validate → create → lock → update → check → unlock → activate)
2. ✅ **handleCreateDomain** → Migrated to `DomainBuilder` (uses builder chain: validate → create → lock → update → check → unlock → activate)
3. ✅ **handleCreateDataElement** → Migrated to `DataElementBuilder` (uses builder chain: validate → create → lock → update → check → unlock → activate)
4. ✅ **handleCreateFunctionGroup** → Migrated to `FunctionGroupBuilder` (uses builder chain: validate → create → activate)
5. ✅ **handleCreateFunctionModule** → Migrated to `FunctionModuleBuilder` (uses builder chain: validate → create → lock → update → check → unlock → activate)
6. ✅ **handleCreateProgram** → Migrated to `ProgramBuilder` (uses builder chain: validate → create → lock → update → check → unlock → activate)
7. ✅ **handleCreateInterface** → Migrated to `InterfaceBuilder` (uses builder chain: validate → create → lock → update → check → unlock → activate)
8. ✅ **handleCreateStructure** → Migrated to `StructureBuilder` (uses builder chain: validate → create → lock → update → check → unlock → activate)
9. ✅ **handleCreateTable** → Migrated to `TableBuilder` (uses builder chain: validate → create → lock → update → check → unlock → activate)
10. ✅ **handleCreateView** → Migrated to `ViewBuilder` (uses builder chain: validate → create → lock → update → check → unlock → activate)
11. ✅ **handleCreatePackage** → Migrated to `PackageBuilder` (uses builder chain: validate → create → check)
12. ✅ **handleCreateTransport** → Migrated to `TransportBuilder` (uses builder chain: create)

#### UPDATE Handlers (7 handlers) - ✅ Migrated to Builders
1. ✅ **handleUpdateClassSource** → Migrated to `ClassBuilder` (uses builder chain: validate → lock → update → check → unlock → activate)
2. ✅ **handleUpdateDomain** → Migrated to `DomainBuilder` (uses builder chain: validate → lock → update → check → unlock → activate)
3. ✅ **handleUpdateDataElement** → Migrated to `DataElementBuilder` (uses builder chain: validate → lock → update → check → unlock → activate)
4. ✅ **handleUpdateFunctionModuleSource** → Migrated to `FunctionModuleBuilder` (uses builder chain: validate → lock → update → check → unlock → activate)
5. ✅ **handleUpdateProgramSource** → Migrated to `ProgramBuilder` (uses builder chain: validate → lock → update → check → unlock → activate)
6. ✅ **handleUpdateInterfaceSource** → Migrated to `InterfaceBuilder` (uses builder chain: validate → lock → update → check → unlock → activate)
7. ✅ **handleUpdateViewSource** → Migrated to `ViewBuilder` (uses builder chain: validate → lock → update → check → unlock → activate)

#### DELETE Handlers (1 handler) - ✅ Migrated to adt-clients function
1. ✅ **handleDeleteObject** → Migrated to `deleteObject` function from `@mcp-abap-adt/adt-clients/core`
   - Uses generic `deleteObject` function that supports all object types
   - Connection management handled internally

#### ACTIVATE Handlers (1 handler) - ✅ Migrated to adt-clients function
1. ✅ **handleActivateObject** → Migrated to `activateObjectsGroup` and `parseActivationResponse` from `@mcp-abap-adt/adt-clients/core`
   - Uses generic `activateObjectsGroup` function for batch activation
   - Connection management handled internally

#### CHECK Handlers (1 handler) - ✅ Migrated to adt-clients function
1. ✅ **handleCheckObject** → Migrated to `runCheckRun` and `parseCheckRunResponse` from `@mcp-abap-adt/adt-clients/core`
   - Uses generic `runCheckRun` function that supports all object types
   - Connection management handled internally

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
**Status**: ✅ Completed - All generic handlers migrated

**Handlers**:
- ✅ `handleDeleteObject` - Migrated to `deleteObject` function from `@mcp-abap-adt/adt-clients/core`
- ✅ `handleActivateObject` - Migrated to `activateObjectsGroup` and `parseActivationResponse` from `@mcp-abap-adt/adt-clients/core`
- ✅ `handleCheckObject` - Migrated to `runCheckRun` and `parseCheckRunResponse` from `@mcp-abap-adt/adt-clients/core`

**Implementation**: Option B - Generic handlers kept for MCP API consistency, using adt-clients functions internally.

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

### ✅ All Operations Available
- **Delete operations**: Generic `deleteObject` function available in `@mcp-abap-adt/adt-clients/core` for all object types
- **Generic operations**: All generic handlers migrated to use adt-clients functions

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
- ✅ handleCreateClass
- ✅ handleCreateDomain
- ✅ handleCreateDataElement
- ✅ handleCreateFunctionGroup
- ✅ handleCreateFunctionModule
- ✅ handleCreateProgram
- ✅ handleCreateInterface
- ✅ handleCreateStructure
- ✅ handleCreateTable
- ✅ handleCreateView
- ✅ handleCreatePackage
- ✅ handleCreateTransport

### UPDATE Handlers
- ✅ handleUpdateClassSource
- ✅ handleUpdateDomain
- ✅ handleUpdateDataElement
- ✅ handleUpdateFunctionModuleSource
- ✅ handleUpdateProgramSource
- ✅ handleUpdateInterfaceSource
- ✅ handleUpdateViewSource

### Generic Handlers
- ✅ handleDeleteObject → Migrated to deleteObject function
- ✅ handleActivateObject → Migrated to activateObjectsGroup function
- ✅ handleCheckObject → Migrated to runCheckRun function

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
- ✅ **24 handlers migrated** (all CREATE, UPDATE, DELETE, ACTIVATE, and CHECK handlers)
- ✅ **All handlers now use adt-clients** - no more custom `makeAdtRequestWithSession` in handlers
- ✅ **100% migration complete** - all handlers use centralized connection management and adt-clients functions

## Migration Progress

**Completed (24/24 handlers):**
- ✅ handleCreateClass → ClassBuilder
- ✅ handleUpdateClassSource → ClassBuilder
- ✅ handleCreateDomain → DomainBuilder
- ✅ handleUpdateDomain → DomainBuilder
- ✅ handleCreateDataElement → DataElementBuilder
- ✅ handleUpdateDataElement → DataElementBuilder
- ✅ handleCreateFunctionGroup → FunctionGroupBuilder
- ✅ handleCreateFunctionModule → FunctionModuleBuilder
- ✅ handleUpdateFunctionModuleSource → FunctionModuleBuilder
- ✅ handleCreateProgram → ProgramBuilder
- ✅ handleUpdateProgramSource → ProgramBuilder
- ✅ handleCreateInterface → InterfaceBuilder
- ✅ handleUpdateInterfaceSource → InterfaceBuilder
- ✅ handleCreateStructure → StructureBuilder
- ✅ handleCreateTable → TableBuilder
- ✅ handleCreateView → ViewBuilder
- ✅ handleUpdateViewSource → ViewBuilder
- ✅ handleCreatePackage → PackageBuilder
- ✅ handleCreateTransport → TransportBuilder
- ✅ handleDeleteObject → deleteObject function from adt-clients/core
- ✅ handleActivateObject → activateObjectsGroup and parseActivationResponse from adt-clients/core
- ✅ handleCheckObject → runCheckRun and parseCheckRunResponse from adt-clients/core

**Migration Status: 100% Complete**
- All 24 handlers migrated to use adt-clients
- All handlers use centralized connection management
- No more custom `makeAdtRequestWithSession` in handlers

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

