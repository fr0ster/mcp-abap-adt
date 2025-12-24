# Test Refactoring Roadmap

## Goal
Refactor integration tests to use a unified `LambdaTester` class that provides common infrastructure (connection, session, logger, params) and executes test logic via lambdas. This allows tests to define custom workflow logic while sharing common infrastructure.

## Architecture

### Unified LambdaTester
```
LambdaTester (single class for all test types)
```

### LambdaTester Responsibilities
- **Constructor**: Loads test parameters from YAML, creates connection, sets up logger
  - Parameters: `handlerName`, `testCaseName`, `logPrefix`, `paramsGroupName`
  - Loads `.env` via `loadTestEnv()`
  - Loads YAML config via `loadTestConfig()` and `getEnabledTestCase()`
  - Resolves parameters from `paramsGroupName` or `testCase.params`
  - Sets `hasConfig = true` if parameters loaded successfully
  - Creates connection via `createTestConnectionAndSession()`
  - Creates logger via `createTestLogger(logPrefix)`
  - Resolves `objectName`, `packageName`, `transportRequest`
- **Lifecycle methods** (all accept lambdas):
  - `beforeAll(lambda, cleanupAfter?)` - Initializes tester, then executes lambda; stores cleanup lambda
  - `afterAll(lambda)` - Executes cleanup lambda
  - `beforeEach(lambda)` - Executes setup lambda before each test
  - `afterEach(lambda)` - Executes cleanup lambda after each test
- **run(lambda)** - Executes test lambda with context
- **Context provides**:
  - `connection`, `session`, `logger` (for tests)
  - `objectName`, `params`, `packageName`, `transportRequest`
  - `cleanupAfter()` - Method that checks YAML params, then calls cleanup lambda from test

### Test Lambda Responsibilities
- Define custom workflow logic (create, update, delete, etc.)
- Decide what messages to log
- Pass logger to handlers via `createHandlerContext()` (if `DEBUG_HANDLERS=true`)
- Handle errors and skip conditions

## Implementation Phases

### Phase 1: LambdaTester Foundation ✅
- [x] Create `LambdaTester` class
  - [x] Constructor: `handlerName`, `testCaseName`, `logPrefix`, `paramsGroupName`
  - [x] `init()` method - loads config, creates connection, sets up context:
    - [x] Load `.env` via `loadTestEnv()`
    - [x] Load YAML config via `loadTestConfig()` and `getEnabledTestCase()`
    - [x] Resolve parameters from `paramsGroupName` or `testCase.params`
    - [x] Set `hasConfig = true` if parameters loaded successfully
    - [x] Create connection via `createTestConnectionAndSession()`
    - [x] Create logger via `createTestLogger(logPrefix)`
    - [x] Resolve `objectName`, `packageName`, `transportRequest`
    - [x] Create context with `cleanupAfter()` method
  - [x] `beforeAll(lambda, cleanupAfter?)` - initializes tester, stores cleanup lambda, executes lambda
  - [x] `afterAll(lambda)` - executes cleanup lambda
  - [x] `beforeEach(lambda)` - executes setup lambda
  - [x] `afterEach(lambda)` - executes cleanup lambda
  - [x] `run(lambda)` - executes test lambda with context
  - [x] `cleanupAfter()` - checks YAML params via `getCleanupAfter()`, then calls cleanup lambda from test
  - [x] Context type: `LambdaTesterContext` with `cleanupAfter: () => Promise<void>`

### Phase 2: Convert Tests to LambdaTester
- [x] Refactor `ClassHighHandlers.test.ts` ✅
  - [x] Replace with `LambdaTester`
  - [x] Define lambdas for `beforeAll`, `afterAll`, `beforeEach`, `afterEach`, `run`
  - [x] Pass `cleanupAfter` lambda to `beforeAll`
  - [x] Use `createHandlerContext()` to pass logger to handlers (if `DEBUG_HANDLERS=true`)
- [ ] Convert remaining test files to use `LambdaTester` with lambdas:
  - [ ] High-level tests (13 files):
    - [ ] `DataElementHighHandlers.test.ts`
    - [ ] `DomainHighHandlers.test.ts`
    - [ ] `InterfaceHighHandlers.test.ts`
    - [ ] `ProgramHighHandlers.test.ts`
    - [ ] `StructureHighHandlers.test.ts`
    - [ ] `TableHighHandlers.test.ts`
    - [ ] `ViewHighHandlers.test.ts`
    - [ ] `BehaviorDefinitionHighHandlers.test.ts`
    - [ ] `BehaviorImplementationHighHandlers.test.ts`
    - [ ] `ServiceDefinitionHighHandlers.test.ts`
    - [ ] `FunctionHighHandlers.test.ts`
    - [ ] `MetadataExtensionHighHandlers.test.ts`
    - [ ] `PackageHighHandlers.test.ts`
  - [ ] Low-level tests (14 files):
    - [ ] `ClassLowHandlers.test.ts`
    - [ ] `DataElementLowHandlers.test.ts`
    - [ ] `DomainLowHandlers.test.ts`
    - [ ] `InterfaceLowHandlers.test.ts`
    - [ ] `ProgramLowHandlers.test.ts`
    - [ ] `StructureLowHandlers.test.ts`
    - [ ] `TableLowHandlers.test.ts`
    - [ ] `ViewLowHandlers.test.ts`
    - [ ] `BehaviorDefinitionLowHandlers.test.ts`
    - [ ] `FunctionModuleLowHandlers.test.ts`
    - [ ] `MetadataExtensionLowHandlers.test.ts`
    - [ ] `BehaviorImplementationLowHandlers.test.ts`
    - [ ] `FunctionGroupLowHandlers.test.ts`
    - [ ] `PackageLowHandlers.test.ts`
  - [ ] Read-only tests (if any)
  - [ ] Other tests:
    - [ ] `src/__tests__/integration/low/unitTest/ClassUnitTestHandlers.test.ts` (if applicable)
    - [ ] `ClassCrudClientDirect.test.ts` (if applicable)

### Phase 3: Testing & Validation
- [ ] Run all refactored tests
- [ ] Verify connection creation via AuthBroker works
- [ ] Verify session management works correctly
- [ ] Verify cleanup works correctly (via `cleanupAfter` lambda)
- [ ] Verify logging prefixes work
- [ ] Verify `createHandlerContext()` passes logger correctly (if `DEBUG_HANDLERS=true`)
- [ ] Fix any remaining issues
- [ ] Update documentation

### Phase 4: Refactor Handlers to Use Context Instead of Connection
**Goal**: Replace `connection: AbapConnection` parameter with `context: HandlerContext` in all handlers. The context will contain `connection` and `logger`, providing better structure and enabling consistent logging across all handlers.

**Benefits**:
- Unified context object for all handlers
- Consistent logger access in all handlers
- Better separation of concerns
- Easier to extend context with additional properties in the future

**Context Structure**:
```typescript
interface HandlerContext {
  connection: AbapConnection;
  logger: Logger;
}
```

**Migration Strategy**:
1. Create `HandlerContext` interface in shared location
2. Update handler signatures one by one
3. Update all handler calls in tests and MCP server
4. Remove direct `connection` parameter usage

#### Create HandlerContext Interface
- [x] Create `src/lib/handlers/interfaces.ts` with `HandlerContext` interface
- [x] Export `HandlerContext` from appropriate location
- [x] Document context structure and usage (interface is self-documenting)

#### Update Handler Signatures
- [x] Update all high-level handlers: ✅ (All completed!)
  - [x] `handleCreateClass`
  - [x] `handleUpdateClass`
  - [x] `handleCreateDataElement`
  - [x] `handleUpdateDataElement`
  - [x] `handleCreateDomain`
  - [x] `handleUpdateDomain`
  - [x] `handleCreateInterface`
  - [x] `handleUpdateInterface`
  - [x] `handleCreateProgram`
  - [x] `handleUpdateProgram`
  - [x] `handleCreateStructure`
  - [x] `handleUpdateStructure`
  - [x] `handleCreateTable`
  - [x] `handleUpdateTable`
  - [x] `handleCreateView`
  - [x] `handleUpdateView`
  - [x] `handleCreateBehaviorDefinition`
  - [x] `handleUpdateBehaviorDefinition`
  - [x] `handleCreateBehaviorImplementation`
  - [x] `handleUpdateBehaviorImplementation`
  - [x] `handleCreateServiceDefinition`
  - [x] `handleUpdateServiceDefinition`
  - [x] `handleCreateMetadataExtension`
  - [x] `handleUpdateMetadataExtension`
  - [x] `handleCreateFunctionModule`
  - [x] `handleUpdateFunctionModule`
  - [x] `handleCreatePackage`
  - [x] `handleUpdatePackage`

- [x] Update all low-level handlers: ✅ (All completed!)
  - [x] Class handlers: ✅
    - [x] `handleDeleteClass`
    - [x] `handleLockClass`
    - [x] `handleActivateClass`
    - [x] `handleCheckClass`
    - [x] `handleCreateClass` (low-level)
    - [x] `handleUpdateClass` (low-level)
    - [x] `handleUnlockClass`
    - [x] `handleValidateClass`
  - [x] DataElement handlers:
    - [x] `handleCreateDataElement` (low-level)
    - [x] `handleUpdateDataElement` (low-level)
    - [x] `handleDeleteDataElement`
    - [x] `handleLockDataElement`
    - [x] `handleUnlockDataElement`
    - [x] `handleActivateDataElement`
    - [x] `handleCheckDataElement`
    - [x] `handleValidateDataElement`
  - [x] Domain handlers:
    - [x] `handleCreateDomain` (low-level)
    - [x] `handleUpdateDomain` (low-level)
    - [x] `handleDeleteDomain`
    - [x] `handleLockDomain`
    - [x] `handleUnlockDomain`
    - [x] `handleActivateDomain`
    - [x] `handleCheckDomain`
    - [x] `handleValidateDomain`
  - [x] Interface handlers (10/10) ✅
  - [x] Program handlers (11/11) ✅
  - [x] Structure handlers (10/10) ✅
  - [x] Table handlers (11/11) ✅
  - [x] View handlers (10/10) ✅
  - [x] BehaviorDefinition handlers: ✅ (7/7)
    - [x] `handleCreateBehaviorDefinition` (high-level)
    - [x] `handleDeleteBehaviorDefinition`
    - [x] `handleUpdateBehaviorDefinition`
    - [x] `handleLockBehaviorDefinition`
    - [x] `handleUnlockBehaviorDefinition`
    - [x] `handleCheckBehaviorDefinition`
    - [x] `handleValidateBehaviorDefinition`
  - [x] BehaviorImplementation handlers: ✅ (5/5)
    - [x] `handleCreateBehaviorImplementation` (high-level)
    - [x] `handleUpdateBehaviorImplementation` (high-level)
    - [x] `handleCreateBehaviorImplementation` (low-level)
    - [x] `handleLockBehaviorImplementation`
    - [x] `handleValidateBehaviorImplementation`
  - [x] FunctionModule handlers (19/19) ✅
  - [x] FunctionGroup handlers (included in Function handlers above)
  - [x] Package handlers (9/9) ✅
  - [x] MetadataExtension handlers (10/10) ✅

- [x] Update all read-only handlers: ✅ (All completed!)
  - [x] `handleGetProgram`
  - [x] `handleGetTable`
  - [x] `handleGetDataElement`
  - [x] `handleGetDomain`
  - [x] `handleGetStructure`
  - [x] `handleGetInterface`
  - [x] `handleGetView`
  - [x] `handleGetClass`
  - [x] `handleGetFunction`
  - [x] `handleGetFunctionGroup`
  - [x] `handleGetObjectInfo`
  - [x] `handleGetProgFullCode`
  - [x] `handleGetServiceDefinition`
  - [x] `handleGetTransport`
  - [x] `handleGetAbapSystemSymbols`
  - [x] `handleGetInactiveObjects`
  - [x] `handleGetSession`
  - [x] `handleSearchObject`
  - [x] `handleGetIncludesList`
  - [x] `handleGetInclude`
  - [x] `handleGetObjectsList`
  - [x] `handleGetObjectsByType`
  - [x] `handleGetTypeInfo`
  - [x] `handleGetObjectNodeFromCache`
  - [x] `handleDescribeByList`
  - [x] `handleGetObjectStructure`
  - [x] `handleGetAdtTypes`

#### Update Handler Registration Infrastructure
- [x] Update `BaseHandlerGroup` class:
  - [x] Change constructor to accept `context: HandlerContext` instead of `connection: AbapConnection`
  - [x] Update `registerToolOnServer` method to pass `context` instead of `this.connection` to handlers
  - [x] Store context instead of connection as class property
  - [x] Update all handler group subclasses: ✅ (All completed - they inherit from BaseHandlerGroup which uses context)
    - [x] `ReadOnlyHandlersGroup` ✅ (all handlers wrapped in lambdas with `this.context`)
    - [x] `HighLevelHandlersGroup` ✅ (all handlers wrapped in lambdas with `this.context`)
    - [x] `LowLevelHandlersGroup` ✅ (all handlers wrapped in lambdas with `this.context`)
    - [x] `SystemHandlersGroup` ✅ (all handlers wrapped in lambdas with `this.context`, removed unused AbapConnection import)
    - [x] `SearchHandlersGroup` ✅ (all handlers wrapped in lambdas with `this.context`)
    - [x] No other handler group classes found
- [x] Update `mcp_handlers.ts`:
  - [x] Create `HandlerContext` with connection and logger before registering handlers (context passed as parameter)
  - [x] Update all `registerToolOnServer` calls to pass `context` instead of `connection` ✅ (all calls use `context` parameter)
  - [x] Update pattern: `handler(connection, args)` → `handler(context, args)` ✅
  - [x] Ensure logger is created with appropriate category/prefix for each handler group ✅
- [x] Update handler group instantiations: ✅ (All completed)
  - [x] Update `usage-example.ts` to pass context instead of connection ✅
  - [x] Update any other files that instantiate handler groups ✅
  - [x] Update `index.ts` or main server file if it creates handler groups ✅ (mcp_handlers.ts uses context)
- [x] Update any other handler registry files: ✅
  - [x] Check for other files that register handlers directly (not through groups) ✅ (mcp_handlers.ts uses context)
  - [x] Update to use context pattern ✅
  - [x] Ensure consistent logger creation across all registration points ✅

#### Update Handler Calls
- [x] Update MCP server handler registration to pass context ✅ (BaseHandlerGroup.registerToolOnServer calls handler with this.context)
- [x] Create `createHandlerContext` helper function ✅ (in testHelpers.ts, includes logger only if DEBUG_HANDLERS=true)
- [x] Update test workflow functions to use `createHandlerContext` helper
  - [x] Update `ClassHighHandlers.test.ts` ✅ (converted to LambdaTester with lambdas)
  - [x] Update `ClassHighHandlers.example.ts` ✅
  - [ ] Convert remaining tests to `LambdaTester` with lambdas (see Phase 2)
- [ ] Update any internal handler-to-handler calls

#### Update Handler Internals
- [x] Replace `connection` usage with `context.connection` in all handlers ✅
- [x] Replace logger creation/usage with `context.logger` in all handlers ✅
- [x] Remove redundant logger initialization code ✅
- [x] Ensure consistent logging format across all handlers ✅
- [x] **Logger Cleanup**: All handlers now use `logger` from `HandlerContext` instead of `handlerLogger` (30 files cleaned up) ✅

## File Structure

```
src/__tests__/integration/
├── helpers/
│   ├── testHelpers.ts (existing)
│   │   └── createHandlerContext() - creates HandlerContext with optional logger (if DEBUG_HANDLERS=true)
│   ├── sessionHelpers.ts (existing)
│   ├── configHelpers.ts (existing)
│   └── testers/
│       ├── LambdaTester.ts (unified tester for all test types)
│       └── types.ts
│           └── LambdaTesterContext - context interface with cleanupAfter method
└── [domain]/
    └── [Domain][Type]Handlers.test.ts (refactored to use LambdaTester with lambdas)
```

## Example Usage

### LambdaTester Example
```typescript
import type { LambdaTesterContext } from '../helpers/testers/types';
import { createHandlerContext } from '../helpers/testHelpers';
import { createTestLogger } from '../helpers/loggerHelpers';

describe('Class High-Level Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('class-high'); // Logger created in test scope

  beforeAll(async () => {
    tester = new LambdaTester(
      'create_class',
      'builder_class',
      'class-high',
      'builder_class' // paramsGroupName
    );
    await tester.beforeAll(
      async (context: LambdaTesterContext) => {
        // Additional setup if needed
      },
      // Cleanup lambda - will be called by tester after checking YAML params
      async (context: LambdaTesterContext) => {
        const { connection, objectName, transportRequest } = context;
        if (!objectName) return;
        
        // Logger captured from closure
        const handlerContext = createHandlerContext({ connection, logger });
        await handleDeleteClass(handlerContext, {
          class_name: objectName,
          ...(transportRequest && { transport_request: transportRequest })
        });
      }
    );
  });

  afterEach(async () => {
    await tester.afterEach(async (context: LambdaTesterContext) => {
      // cleanupAfter checks YAML params, then calls cleanup lambda
      await context.cleanupAfter();
    });
  });

  it('should test all Class high-level handlers', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, session, objectName, params, packageName, transportRequest } = context;
      
      // Test decides what to log
      logger?.info(`   • create: ${objectName}`);
      
      // Test decides whether to pass logger to handlers (via createHandlerContext)
      const handlerContext = createHandlerContext({ connection, logger });
      const createResponse = await handleCreateClass(handlerContext, {
        class_name: objectName,
        package_name: packageName,
        source_code: params.source_code,
        activate: true,
        ...(transportRequest && { transport_request: transportRequest })
      });
      
      // Handle response, log results, etc.
      // ...
    });
  });
});
```

**See**: `src/__tests__/integration/class/ClassHighHandlers.test.ts` for complete example.

## Progress Summary

### Phase 4: Handler Context Refactoring Status

**Overall Progress**: ~99% Complete

**Summary**:
- ✅ All handler signatures updated to use `HandlerContext` (150+ handlers)
- ✅ All handlers use `logger` from context (Logger Cleanup completed - 30 files)
- ✅ HandlerContext interface created and exported
- ✅ BaseHandlerGroup updated to use context
- ✅ Handler registration infrastructure (mcp_handlers.ts) - all calls use context
- ✅ All handler group subclasses ready (inherit from BaseHandlerGroup, use context correctly)
- ✅ Handler group instantiations updated (usage-example.ts, index.ts use context)
- ✅ **LambdaTester Architecture**: Unified tester with lambda-based workflow
  - ✅ Constructor loads YAML params, creates connection, sets up logger
  - ✅ Lifecycle methods (`beforeAll`, `afterAll`, `beforeEach`, `afterEach`) accept lambdas
  - ✅ `run(lambda)` executes test logic
  - ✅ `cleanupAfter` lambda passed to `beforeAll`, called after YAML param check
  - ✅ Context provides all infrastructure (connection, session, logger, params, cleanupAfter)
  - ✅ Logger for handlers passed via `createHandlerContext()` (if `DEBUG_HANDLERS=true`)
- ⏳ Convert remaining tests to use `LambdaTester` with lambdas

#### Completed ✅
- **HandlerContext Interface**: Created in `src/lib/handlers/interfaces.ts`
- **BaseHandlerGroup**: Updated to accept and use `HandlerContext`
- **Class Handlers (8/8)**:
  - High-level: `handleCreateClass`, `handleUpdateClass`
  - Low-level: `handleDeleteClass`, `handleLockClass`, `handleActivateClass`, `handleCheckClass`, `handleCreateClass`, `handleUpdateClass`, `handleUnlockClass`, `handleValidateClass`
- **Read-only Handlers (30+/30+)** ✅:
  - Domain-specific: `handleGetProgram`, `handleGetTable`, `handleGetDataElement`, `handleGetDomain`, `handleGetStructure`, `handleGetInterface`, `handleGetView`, `handleGetClass`, `handleGetFunction`, `handleGetFunctionGroup`, `handleGetPackage`
  - System: `handleGetObjectInfo`, `handleGetAbapSystemSymbols`, `handleGetInactiveObjects`, `handleGetSession`, `handleGetTransaction`, `handleGetWhereUsed`, `handleGetAbapSemanticAnalysis`, `handleGetAbapAST`, `handleGetSqlQuery`, `handleGetTypeInfo`, `handleGetObjectNodeFromCache`, `handleDescribeByList`, `handleGetObjectStructure`, `handleGetAdtTypes`
  - Search: `handleSearchObject`, `handleGetObjectsList`, `handleGetObjectsByType`
  - Transport: `handleGetTransport`
  - Include: `handleGetIncludesList`, `handleGetInclude`
  - Program: `handleGetProgFullCode`
  - ServiceDefinition: `handleGetServiceDefinition`
- **BehaviorDefinition Handlers (7/7)** ✅:
  - High-level: `handleCreateBehaviorDefinition`
  - Low-level: `handleDeleteBehaviorDefinition`, `handleUpdateBehaviorDefinition`, `handleLockBehaviorDefinition`, `handleUnlockBehaviorDefinition`, `handleCheckBehaviorDefinition`, `handleValidateBehaviorDefinition`
- **BehaviorImplementation Handlers (5/5)** ✅:
  - High-level: `handleCreateBehaviorImplementation`, `handleUpdateBehaviorImplementation`
  - Low-level: `handleCreateBehaviorImplementation`, `handleLockBehaviorImplementation`, `handleValidateBehaviorImplementation`
- **DataElement Handlers (10/10)** ✅:
  - High-level: `handleCreateDataElement`, `handleUpdateDataElement`
  - Low-level: `handleCreateDataElement`, `handleUpdateDataElement`, `handleDeleteDataElement`, `handleLockDataElement`, `handleUnlockDataElement`, `handleActivateDataElement`, `handleCheckDataElement`, `handleValidateDataElement`
- **Domain Handlers (10/10)** ✅:
  - High-level: `handleCreateDomain`, `handleUpdateDomain`
  - Low-level: `handleCreateDomain`, `handleUpdateDomain`, `handleDeleteDomain`, `handleLockDomain`, `handleUnlockDomain`, `handleActivateDomain`, `handleCheckDomain`, `handleValidateDomain`
- **Interface Handlers (10/10)** ✅:
  - High-level: `handleCreateInterface`, `handleUpdateInterface`
  - Low-level: `handleCreateInterface`, `handleUpdateInterface`, `handleDeleteInterface`, `handleLockInterface`, `handleUnlockInterface`, `handleActivateInterface`, `handleCheckInterface`, `handleValidateInterface`
- **Program Handlers (11/11)** ✅:
  - High-level: `handleCreateProgram`, `handleUpdateProgram`
  - Low-level: `handleCreateProgram`, `handleUpdateProgram`, `handleDeleteProgram`, `handleLockProgram`, `handleUnlockProgram`, `handleActivateProgram`, `handleCheckProgram`, `handleValidateProgram`
  - Read-only: `handleGetProgFullCode`
- **Structure Handlers (10/10)** ✅:
  - High-level: `handleCreateStructure`, `handleUpdateStructure`
  - Low-level: `handleCreateStructure`, `handleUpdateStructure`, `handleDeleteStructure`, `handleLockStructure`, `handleUnlockStructure`, `handleActivateStructure`, `handleCheckStructure`, `handleValidateStructure`
  - Read-only: `handleGetStructure`
- **Table Handlers (11/11)** ✅:
  - High-level: `handleCreateTable`, `handleUpdateTable`
  - Low-level: `handleCreateTable`, `handleUpdateTable`, `handleDeleteTable`, `handleLockTable`, `handleUnlockTable`, `handleActivateTable`, `handleCheckTable`, `handleValidateTable`
  - Read-only: `handleGetTableContents`
- **View Handlers (10/10)** ✅:
  - High-level: `handleCreateView`, `handleUpdateView`
  - Low-level: `handleCreateView`, `handleUpdateView`, `handleDeleteView`, `handleLockView`, `handleUnlockView`, `handleActivateView`, `handleCheckView`, `handleValidateView`
  - Read-only: `handleGetView`
- **Package Handlers (9/9)** ✅:
  - High-level: `handleCreatePackage`
  - Low-level: `handleCreatePackage`, `handleUpdatePackage`, `handleDeletePackage`, `handleLockPackage`, `handleUnlockPackage`, `handleCheckPackage`, `handleValidatePackage`
  - Read-only: `handleGetPackage`
- **ServiceDefinition Handlers (3/3)** ✅:
  - High-level: `handleCreateServiceDefinition`, `handleUpdateServiceDefinition`
  - Read-only: `handleGetServiceDefinition`
- **Function Handlers (19/19)** ✅:
  - High-level: `handleCreateFunctionModule`, `handleUpdateFunctionModule`, `handleCreateFunctionGroup`, `handleUpdateFunctionGroup`
  - Low-level FunctionModule: `handleCreateFunctionModule`, `handleUpdateFunctionModule`, `handleDeleteFunctionModule`, `handleLockFunctionModule`, `handleUnlockFunctionModule`, `handleActivateFunctionModule`, `handleCheckFunctionModule`, `handleValidateFunctionModule`
  - Low-level FunctionGroup: `handleCreateFunctionGroup`, `handleLockFunctionGroup`, `handleUnlockFunctionGroup`, `handleDeleteFunctionGroup`, `handleActivateFunctionGroup`, `handleCheckFunctionGroup`, `handleValidateFunctionGroup`
- **MetadataExtension (DDLX) Handlers (10/10)** ✅:
  - High-level: `handleCreateMetadataExtension`, `handleUpdateMetadataExtension`
  - Low-level: `handleCreateMetadataExtension`, `handleUpdateMetadataExtension`, `handleDeleteMetadataExtension`, `handleLockMetadataExtension`, `handleUnlockMetadataExtension`, `handleActivateMetadataExtension`, `handleCheckMetadataExtension`, `handleValidateMetadataExtension`
- **Common Handlers (6/6)** ✅:
  - `handleActivateObject`, `handleCheckObject`, `handleDeleteObject`, `handleLockObject`, `handleUnlockObject`, `handleValidateObject`
- **Transport Handlers (3/3)** ✅:
  - High-level: `handleCreateTransport`
  - Low-level: `handleCreateTransport`
  - Read-only: `handleGetTransport`
- **Search Read-only Handlers (2/2)** ✅:
  - `handleGetObjectsList`, `handleGetObjectsByType`
- **System Read-only Handlers (11/11)** ✅:
  - `handleGetObjectStructure`, `handleGetAllTypes`, `handleGetInactiveObjects`, `handleGetSession`, `handleGetTransaction`, `handleGetWhereUsed`, `handleGetAbapSemanticAnalysis`, `handleGetAbapAST`, `handleGetSqlQuery`, `handleDescribeByList`, `handleGetObjectNodeFromCache`

#### In Progress 🔄
- **mcp_handlers.ts**: ✅ All registration calls use context parameter
- **Handler Groups**: ✅ All handlers wrapped in lambdas with `this.context` (SystemHandlersGroup updated by user)
- **Remaining read-only handlers**: None (all 30+ completed!) ✅
- **Remaining high-level handlers**: None (all completed!) ✅
- **Remaining low-level handlers**: None (all completed!) ✅

#### Pending ⏳
- Convert remaining tests to use `LambdaTester` with lambdas
- Update any internal handler-to-handler calls

#### Completed ✅
- **Logger Cleanup**: ✅ **COMPLETED** - All handlers now use `logger` from `HandlerContext` instead of `handlerLogger`
- **Handler Group Subclasses**: ✅ **COMPLETED** - All 5 handler group subclasses have all handlers wrapped in lambdas with `this.context`
- **MCP Server Handler Registration**: ✅ **COMPLETED** - BaseHandlerGroup.registerToolOnServer calls handlers with `this.context`
- **LambdaTester Architecture**: ✅ **COMPLETED** - Unified tester with lambda-based workflow
  - ✅ Constructor loads YAML params, creates connection, sets up logger
  - ✅ Lifecycle methods accept lambdas
  - ✅ `cleanupAfter` lambda pattern implemented
  - ✅ Context provides all infrastructure
  - ✅ `ClassHighHandlers.test.ts` converted to new pattern

## Benefits

1. **Consistency**: All tests follow the same pattern
2. **Maintainability**: Changes to test infrastructure in one place
3. **Connection Management**: Unified AuthBroker-based connection creation
4. **Logging**: Consistent prefixes for easy debugging
5. **Reduced Duplication**: Common logic in base class
6. **Type Safety**: TypeScript ensures correct usage

## Notes

- **LambdaTester** provides common infrastructure (connection, session, logger, params, cleanupAfter)
- **Test lambdas** define custom workflow logic (what to log, how to call handlers, etc.)
- **Logger for handlers**: Created in test scope, passed via `createHandlerContext()` (only if `DEBUG_HANDLERS=true`)
- **Connection**: Created in `init()` via `createTestConnectionAndSession()` from `sessionHelpers.ts`
- **Context**: Passed as first argument to handlers (contains connection and optional logger)
- **Session state**: Managed automatically
- **Cleanup**: `cleanupAfter` lambda passed to `beforeAll`, called by tester after checking YAML params via `getCleanupAfter()`
- **Test configuration**: Loaded from `test-config.yaml` via config helpers in constructor/init
- **Cleanup parameters**: `skip_cleanup`, `cleanup_after` from YAML are checked by tester before calling cleanup lambda
- **Parameter groups**: Resolved from `paramsGroupName` (supports both test case level and global level)
