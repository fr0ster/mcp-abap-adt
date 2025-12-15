# Handler Build Errors Roadmap

**Created**: 2025-12-15
**Status**: In Progress
**Priority**: Critical (blocking build)

## Overview

Build is failing with **~260+ TypeScript errors** across **73 handler files**. The root cause is an incomplete refactoring where:
1. Handler imports were corrupted/truncated
2. `mcp_handlers.ts` does not wrap handlers to inject `connection` as per v2 architecture

## Target Architecture (from ARCHITECTURE.md)

Handlers should have signature `(connection: AbapConnection, args: any) => Promise<any>` and be wrapped during registration:

```typescript
// Handler signature (correct in most files)
type ToolHandler = (connection: AbapConnection, args: any) => Promise<any>;

// Registration wraps to inject connection from context
const wrappedHandler = async (args: any) => {
  const connection = this.getConnection();  // From connectionContext
  return await entry.handler(connection, args);
};
```

## Error Categories

### 1. Corrupted/Truncated Imports (Critical)

Many files have corrupted import statements where parts of identifiers are missing:

| File | Broken Import | Should Be |
|------|---------------|-----------|
| `handleLockBehaviorDefinition.ts` | `{ t }` from `@mcp-abap-adt/adt-clients` | `{ CrudClient }` |
| `handleUnlockBehaviorDefinition.ts` | `{ dClient }` | `{ CrudClient }` |
| `handleActivateClass.ts` | `{ ection }` from `../../../lib/utils` | Full utils import |
| `handleCheckClass.ts` | `{ tion }` from `../../../lib/utils` | Full utils import |

**Pattern**: Imports appear to be truncated from the left side of identifiers.

### 2. Missing Imports (Critical)

The following symbols are used but not imported in affected files:

| Symbol | Type | Source Module |
|--------|------|---------------|
| `return_error` | Function | `../../../lib/utils` |
| `return_response` | Function | `../../../lib/utils` |
| `baseLogger` / `logger` | Object | `../../../lib/utils` |
| `restoreSessionInConnection` | Function | `../../../lib/utils` |
| `AxiosResponse` | Type | `../../../lib/utils` or `axios` |
| `CrudClient` | Class | `@mcp-abap-adt/adt-clients` |
| `AbapConnection` | Type | `@mcp-abap-adt/connection` |

### 3. mcp_handlers.ts Does Not Wrap Handlers (Architectural)

**Current state in mcp_handlers.ts**: `registerToolOnServer` expects `(args: any) => Promise<any>`:
```typescript
// Current (incorrect) - passes handler directly without wrapping
this.registerToolOnServer(server, Tool.name, Tool.description, Tool.inputSchema, handleXxx);

// Inside registerToolOnServer:
server.registerTool(toolName, { description, inputSchema }, async (args: any) => {
  const result = await handler(args);  // Only passes args, no connection!
  ...
});
```

**Required per v2 architecture**: Wrap handlers to inject connection:
```typescript
// Wrapped handler that injects connection
const wrappedHandler = async (args: any) => {
  const connection = this.getConnection();  // Get from connectionContext
  return await handler(connection, args);   // Pass connection as first arg
};
```

**Location**: `src/lib/servers/mcp_handlers.ts:551-589`

### 4. Dynamic Imports Missing Connection (Secondary)

In `mcp_handlers.ts` lines 784-802, dynamic imports call handlers with only 1 argument:
```typescript
return await handleXxx(args);  // Missing connection argument
```

## Affected Files (73 total)

### behavior_definition/low/ (3 files)
- `handleLockBehaviorDefinition.ts`
- `handleUnlockBehaviorDefinition.ts`
- `handleUpdateBehaviorDefinition.ts`

### class/ (4 files)
- `high/handleUpdateClass.ts`
- `low/handleActivateClass.ts`
- `low/handleCheckClass.ts`
- `low/handleUpdateClass.ts`

### common/low/ (3 files)
- `handleActivateObject.ts`
- `handleCheckObject.ts`
- `handleDeleteObject.ts`

### data_element/low/ (6 files)
- `handleActivateDataElement.ts`
- `handleCheckDataElement.ts`
- `handleCreateDataElement.ts`
- `handleDeleteDataElement.ts`
- `handleLockDataElement.ts`
- `handleUnlockDataElement.ts`

### domain/low/ (7 files)
- `handleActivateDomain.ts`
- `handleCheckDomain.ts`
- `handleCreateDomain.ts`
- `handleDeleteDomain.ts`
- `handleUnlockDomain.ts`
- `handleUpdateDomain.ts`
- `handleValidateDomain.ts`

### function/ (7 files)
- `high/handleUpdateFunctionModule.ts`
- `low/handleCheckFunctionModule.ts`
- `low/handleCreateFunctionGroup.ts`
- `low/handleLockFunctionGroup.ts`
- `low/handleLockFunctionModule.ts`
- `low/handleUnlockFunctionGroup.ts`
- `low/handleValidateFunctionModule.ts`

### interface/ (8 files)
- `high/handleCreateInterface.ts`
- `low/handleActivateInterface.ts`
- `low/handleCreateInterface.ts`
- `low/handleDeleteInterface.ts`
- `low/handleLockInterface.ts`
- `low/handleUnlockInterface.ts`
- `low/handleUpdateInterface.ts`
- `low/handleValidateInterface.ts`

### package/low/ (5 files)
- `handleCreatePackage.ts`
- `handleDeletePackage.ts`
- `handleLockPackage.ts`
- `handleUnlockPackage.ts`
- `handleValidatePackage.ts`

### program/ (7 files)
- `low/handleActivateProgram.ts`
- `low/handleCreateProgram.ts`
- `low/handleDeleteProgram.ts`
- `low/handleUnlockProgram.ts`
- `low/handleUpdateProgram.ts`
- `low/handleValidateProgram.ts`
- `readonly/handleGetProgFullCode.ts`

### structure/ (8 files)
- `high/handleCreateStructure.ts`
- `low/handleActivateStructure.ts`
- `low/handleCreateStructure.ts`
- `low/handleDeleteStructure.ts`
- `low/handleLockStructure.ts`
- `low/handleUnlockStructure.ts`
- `low/handleUpdateStructure.ts`
- `low/handleValidateStructure.ts`

### table/low/ (4 files)
- `handleActivateTable.ts`
- `handleCheckTable.ts`
- `handleCreateTable.ts`
- `handleUpdateTable.ts`

### view/ (5 files)
- `high/handleCreateView.ts`
- `high/handleUpdateView.ts`
- `low/handleActivateView.ts`
- `low/handleCheckView.ts`

### transport/ (2 files)
- `low/handleCreateTransport.ts`
- `readonly/handleGetTransport.ts`

### system/readonly/ (4 files)
- `handleGetAbapSystemSymbols.ts`
- `handleGetInactiveObjects.ts`
- `handleGetObjectInfo.ts`
- `handleGetSession.ts`

### service_definition/readonly/ (1 file)
- `handleGetServiceDefinition.ts`

## Fix Strategy (Per v2 Architecture)

The fix follows the architecture defined in `src/lib/servers/ARCHITECTURE.md`:

1. **Keep handler signature** `(connection: AbapConnection, args: any) => Promise<any>` - this is correct
2. **Fix corrupted imports** in handler files
3. **Update mcp_handlers.ts** to wrap handlers and inject connection from context

## Implementation Plan

### Phase 1: Fix Corrupted Imports in Handlers

For each of 73 affected files, restore correct imports:

```typescript
// Required imports for low-level handlers
import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, logger as baseLogger, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';
```

**Reference**: `src/handlers/behavior_definition/low/handleCheckBehaviorDefinition.ts` (correct imports)

### Phase 2: Update McpHandlers Class

Update `src/lib/servers/mcp_handlers.ts` to:

1. **Add connection context** to `McpHandlers` class:
```typescript
export class McpHandlers {
  private connectionContext: ConnectionContext | null = null;

  public setConnectionContext(context: ConnectionContext): void {
    this.connectionContext = context;
  }

  public getConnection(): AbapConnection {
    if (!this.connectionContext?.connectionParams) {
      throw new Error('Connection context not set');
    }
    return createAbapConnection(this.connectionContext.connectionParams);
  }
}
```

2. **Update registerToolOnServer** to wrap handlers:
```typescript
private registerToolOnServer(
  server: McpServer,
  toolName: string,
  description: string,
  inputSchema: any,
  handler: (connection: AbapConnection, args: any) => Promise<any>  // Two-arg signature
) {
  server.registerTool(toolName, { description, inputSchema }, async (args: any) => {
    // Wrap to inject connection
    const connection = this.getConnection();
    const result = await handler(connection, args);
    // ... rest of error handling
  });
}
```

3. **Fix dynamic imports** (lines 784-802):
```typescript
// Before
return await handleXxx(args);

// After
return await handleXxx(this.getConnection(), args);
```

### Phase 3: Verify Build

```bash
npm run build
```

## Detailed File Fixes

### Files with Corrupted Imports (require import restoration)

| Directory | Files | Primary Issue |
|-----------|-------|---------------|
| behavior_definition/low | 3 | `{ t }`, missing utils imports |
| class/low | 3 | `{ ection }`, `{ tion }` |
| data_element/low | 6 | Various truncated imports |
| domain/low | 7 | Missing CrudClient, utils |
| function/low | 5 | Missing imports |
| interface/low | 7 | Various truncated imports |
| package/low | 5 | Missing imports |
| program/low | 6 | Missing imports |
| structure/low | 7 | Missing imports |
| table/low | 4 | Missing imports |
| view/low+high | 5 | Missing imports |

### Files with Correct Imports (reference implementations)

These files have correct import structure and can be used as templates:

- `src/handlers/behavior_definition/low/handleCheckBehaviorDefinition.ts`
- `src/handlers/behavior_definition/low/handleDeleteBehaviorDefinition.ts`
- `src/handlers/behavior_definition/low/handleCreateBehaviorDefinition.ts`

## Testing After Fix

1. **Build verification**: `npm run build` - should pass with 0 errors
2. **Unit tests**: `npm test`
3. **Integration test**: Manual test with SAP system
4. **Tool registration**: Verify all tools appear in MCP tool list

## Notes

- Handler signature `(connection, args)` is **correct** per v2 architecture
- The issue is that `mcp_handlers.ts` was not updated to wrap handlers
- `handleGetProgram.ts` uses a different pattern (gets connection internally) - this should be aligned with v2 architecture
- Consider migrating to `CompositeHandlersRegistry` + `IHandlerGroup` pattern for cleaner registration
