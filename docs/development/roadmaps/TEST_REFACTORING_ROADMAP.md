# Test Refactoring Roadmap

## Goal
Refactor integration tests to use a unified base class hierarchy (`BaseTester` → `HighTester`/`LowTester`/`ReadOnlyTester`) for consistent test behavior, connection management, and logging.

## Architecture

### Class Hierarchy
```
BaseTester (abstract)
├── HighTester
├── LowTester
└── ReadOnlyTester
```

### BaseTester Responsibilities
- Connection management (via AuthBroker or .env)
- Session management
- Lifecycle hooks (`beforeAll`, `afterAll`, `beforeEach`, `afterEach`)
- Common test utilities
- Logging with prefixes
- Configuration loading

### HighTester/LowTester/ReadOnlyTester
- Specific test patterns for each handler type
- `run()` method to execute test workflow
- Handler-specific assertions and validations

## Implementation Phases

### Phase 1: BaseTester Foundation
- [x] Create `BaseTester` abstract class
  - [x] Constructor with test name, log prefix, handler name, optional paramsGroupName
  - [x] `beforeAll()` - load config, create connection via AuthBroker
  - [x] `afterAll()` - cleanup
  - [x] `beforeEach()` - prepare test case, resolve params from group if paramsGroupName provided
  - [x] `afterEach()` - cleanup test artifacts
  - [x] Properties: `connection`, `session`, `hasConfig`, `testCase`, `testParams`
  - [x] Method: `createConnection()` - uses `createTestConnectionAndSession()`
  - [x] Method: `loadTestConfig()` - wrapper for config helpers
  - [x] Method: `getLogger()` - returns logger with prefix
  - [x] Method: `resolveParamsFromGroup()` - resolves parameters from YAML group (supports both test case level and global level)
  - [x] Method: `getTestParams()` - returns resolved test parameters

### Phase 2: LowTester Implementation
- [x] Create `LowTester` class extending `BaseTester`
  - [x] Constructor accepts handler name, test case name, handlers object
  - [x] `run()` method - executes full workflow:
    - [x] Validate → Create → Lock → Update → Unlock → Activate
  - [x] Method: `runValidate()` - calls handler with connection
  - [x] Method: `runCreate()` - calls handler with connection
  - [x] Method: `runLock()` - calls handler with connection
  - [x] Method: `runUpdate()` - calls handler with connection
  - [x] Method: `runUnlock()` - calls handler with connection
  - [x] Method: `runActivate()` - calls handler with connection
  - [x] Method: `runDelete()` - cleanup handler call
  - [x] Method: `cleanup()` - unlock and delete if needed
  - [x] Track: `lockHandle`, `lockSession`, `objectWasCreated`

### Phase 3: HighTester Implementation
- [x] Create `HighTester` class extending `BaseTester`
  - [x] Constructor accepts handler name, test case name, handlers object
  - [x] `run()` method - executes high-level workflow:
    - [x] Create (with full source code)
    - [x] Update (with modified source code)
  - [x] Method: `runCreate()` - calls high-level create handler
  - [x] Method: `runUpdate()` - calls high-level update handler
  - [x] Method: `runDelete()` - cleanup handler call
  - [x] Handle source code management internally

### Phase 4: ReadOnlyTester Implementation
- [x] Create `ReadOnlyTester` class extending `BaseTester`
  - [x] Constructor accepts handler name, test case name, handler function
  - [x] `run()` method - executes read-only operations:
    - [x] Get object info
    - [x] Validate response format
  - [x] Method: `runGet()` - calls read-only handler
  - [x] Method: `validateResponse()` - checks MCP response format
  - [x] No cleanup needed (read-only)

### Phase 5: Refactor Existing Tests
- [x] Refactor `BehaviorDefinitionLowHandlers.test.ts`
  - [x] Replace test structure with `LowTester`
  - [x] Use `tester.run()` instead of manual workflow
- [ ] Refactor `BehaviorDefinitionHighHandlers.test.ts`
  - [ ] Replace with `HighTester`
- [x] Refactor `ClassLowHandlers.test.ts`
  - [x] Replace with `LowTester`
- [x] Refactor `ClassHighHandlers.test.ts`
  - [x] Replace with `HighTester`
- [x] Refactor `DataElementLowHandlers.test.ts`
  - [x] Replace with `LowTester`
- [x] Refactor `DataElementHighHandlers.test.ts`
  - [x] Replace with `HighTester`
- [x] Refactor `DomainLowHandlers.test.ts`
  - [x] Replace with `LowTester`
- [x] Refactor `DomainHighHandlers.test.ts`
  - [x] Replace with `HighTester`
- [x] Refactor `FunctionModuleLowHandlers.test.ts`
  - [x] Replace with `LowTester`
- [x] Fix `FunctionHighHandlers.test.ts`
  - [x] Add connection parameter to all handler calls
- [x] Fix `FunctionGroupLowHandlers.test.ts`
  - [x] Add connection parameter to all handler calls
- [x] Refactor `InterfaceLowHandlers.test.ts`
  - [x] Replace with `LowTester`
- [x] Refactor `InterfaceHighHandlers.test.ts`
  - [x] Replace with `HighTester`
- [x] Refactor `ProgramLowHandlers.test.ts`
  - [x] Replace with `LowTester`
- [x] Refactor `StructureLowHandlers.test.ts`
  - [x] Replace with `LowTester`
- [x] Refactor `StructureHighHandlers.test.ts`
  - [x] Replace with `HighTester`
- [x] Refactor `TableLowHandlers.test.ts`
  - [x] Replace with `LowTester`
- [x] Refactor `ViewLowHandlers.test.ts`
  - [x] Replace with `LowTester`
- [x] Refactor `ViewHighHandlers.test.ts`
  - [x] Replace with `HighTester`
- [x] Refactor `MetadataExtensionLowHandlers.test.ts`
  - [x] Replace with `LowTester`
- [x] Fix `MetadataExtensionHighHandlers.test.ts`
  - [x] Add connection parameter to all handler calls
- [x] Fix `PackageHighHandlers.test.ts`
  - [x] Add connection parameter to all handler calls
- [x] Fix `PackageLowHandlers.test.ts`
  - [x] Add connection parameter to all handler calls
- [x] Refactor `ProgramHighHandlers.test.ts`
  - [x] Replace with `HighTester`
- [x] Fix `ServiceDefinitionHighHandlers.test.ts`
  - [x] Add connection parameter to all handler calls
- [x] Refactor `TableHighHandlers.test.ts`
  - [x] Replace with `HighTester`
- [ ] Refactor `BehaviorImplementationLowHandlers.test.ts`
  - [ ] Replace with `LowTester` (Note: Uses handleCreateClass, handleCheckClass, handleLockBehaviorImplementation, handleUnlockClass, handleActivateClass, handleDeleteClass - may need custom workflow)
- [x] Refactor `BehaviorImplementationHighHandlers.test.ts`
  - [x] Replace with `HighTester`
- [ ] Refactor read-only tests (if any)
  - [ ] Replace with `ReadOnlyTester`

### Phase 6: Testing & Validation
- [ ] Run all refactored tests
- [ ] Verify connection creation via AuthBroker works
- [ ] Verify session management works correctly
- [ ] Verify cleanup works correctly
- [ ] Verify logging prefixes work
- [ ] Fix any remaining issues
- [ ] Update documentation

### Phase 7: Convert Tests to Workflow Functions (Lambdas)
**Goal**: Convert all tests that use direct handler functions to use workflow functions (lambdas) that receive `TesterContext`. This allows tests to define custom handler call logic and logging while tester provides all infrastructure.

**Benefits**:
- Tests define custom handler invocation logic
- Tests can add custom logging per step
- Tester provides all common infrastructure (connection, session, logger, params, etc.)
- Better separation of concerns

**Reference**: See `ClassHighHandlers.example.ts` for example implementation.

#### High-Level Tests (HighTester)
- [x] Convert `ClassHighHandlers.test.ts` to workflow functions
- [ ] Convert `DataElementHighHandlers.test.ts` to workflow functions
- [ ] Convert `DomainHighHandlers.test.ts` to workflow functions
- [ ] Convert `InterfaceHighHandlers.test.ts` to workflow functions
- [ ] Convert `ProgramHighHandlers.test.ts` to workflow functions
- [ ] Convert `StructureHighHandlers.test.ts` to workflow functions
- [ ] Convert `TableHighHandlers.test.ts` to workflow functions
- [ ] Convert `ViewHighHandlers.test.ts` to workflow functions
- [ ] Convert `BehaviorDefinitionHighHandlers.test.ts` to workflow functions
- [ ] Convert `BehaviorImplementationHighHandlers.test.ts` to workflow functions
- [ ] Convert `ServiceDefinitionHighHandlers.test.ts` to workflow functions

#### Low-Level Tests (LowTester)
- [ ] Convert `ClassLowHandlers.test.ts` to workflow functions
- [ ] Convert `DataElementLowHandlers.test.ts` to workflow functions
- [ ] Convert `DomainLowHandlers.test.ts` to workflow functions
- [ ] Convert `InterfaceLowHandlers.test.ts` to workflow functions
- [ ] Convert `ProgramLowHandlers.test.ts` to workflow functions
- [ ] Convert `StructureLowHandlers.test.ts` to workflow functions
- [ ] Convert `TableLowHandlers.test.ts` to workflow functions
- [ ] Convert `ViewLowHandlers.test.ts` to workflow functions
- [ ] Convert `BehaviorDefinitionLowHandlers.test.ts` to workflow functions
- [ ] Convert `FunctionModuleLowHandlers.test.ts` to workflow functions
- [ ] Convert `MetadataExtensionLowHandlers.test.ts` to workflow functions
- [ ] Convert `BehaviorImplementationLowHandlers.test.ts` to workflow functions (if using LowTester)

#### Read-Only Tests (ReadOnlyTester)
- [ ] Convert read-only tests to workflow functions (if any)

### Phase 8: Refactor Handlers to Use Context Instead of Connection
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
  - [ ] Update all handler group subclasses (in progress by user):
    - [ ] `ReadOnlyHandlersGroup`
    - [ ] `HighLevelHandlersGroup`
    - [ ] `LowLevelHandlersGroup`
    - [ ] `SystemHandlersGroup`
    - [ ] `SearchHandlersGroup`
    - [ ] Any other handler group classes
- [x] Update `mcp_handlers.ts`:
  - [x] Create `HandlerContext` with connection and logger before registering handlers (context passed as parameter)
  - [ ] Update all `registerToolOnServer` calls (hundreds of calls) to pass `context` instead of `connection` (in progress by user)
  - [ ] Update pattern: `handler(connection, args)` → `handler(context, args)`
  - [ ] Ensure logger is created with appropriate category/prefix for each handler group
- [ ] Update handler group instantiations:
  - [ ] Update `usage-example.ts` to pass context instead of connection
  - [ ] Update any other files that instantiate handler groups
  - [ ] Update `index.ts` or main server file if it creates handler groups
- [ ] Update any other handler registry files:
  - [ ] Check for other files that register handlers directly (not through groups)
  - [ ] Update to use context pattern
  - [ ] Ensure consistent logger creation across all registration points

#### Update Handler Calls
- [ ] Update MCP server handler registration to pass context
- [ ] Update test workflow functions to pass context
- [ ] Update direct handler calls in tests
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
│   ├── sessionHelpers.ts (existing)
│   ├── configHelpers.ts (existing)
│   └── testers/
│       ├── BaseTester.ts (new)
│       ├── LowTester.ts (new)
│       ├── HighTester.ts (new)
│       └── ReadOnlyTester.ts (new)
└── [domain]/
    └── [Domain][Type]Handlers.test.ts (refactored to use testers)
```

## Example Usage

### LowTester Example
```typescript
describe('BehaviorDefinition Low-Level Handlers Integration', () => {
  let tester: LowTester;

  beforeAll(async () => {
    tester = new LowTester(
      'behavior_definition_low',
      'full_workflow',
      'bdef-low'
    );
    await tester.beforeAll();
  });

  afterAll(async () => {
    await tester.afterAll();
  });

  it('should execute full workflow', async () => {
    await tester.run();
  });
});
```

### HighTester Example (Old Style - Direct Handler Functions)
```typescript
describe('Class High-Level Handlers Integration', () => {
  let tester: HighTester;

  beforeAll(async () => {
    tester = new HighTester(
      'class_high',
      'create_and_update',
      'class-high',
      {
        create: handleCreateClass,
        update: handleUpdateClass,
        delete: handleDeleteClass
      }
    );
    await tester.beforeAll();
  });

  it('should create and update class', async () => {
    await tester.run();
  });
});
```

### HighTester Example (New Style - Workflow Functions / Lambdas)
```typescript
import type { TesterContext } from '../helpers/testers/types';

describe('Class High-Level Handlers Integration', () => {
  let tester: HighTester;

  beforeAll(async () => {
    tester = new HighTester(
      'create_class',
      'builder_class',
      'class-high',
      {
        // Lambda that calls create handler with logging
        create: async (context: TesterContext) => {
          const { connection, session, logger, objectName, params, packageName, transportRequest } = context;

          logger.info(`   • create: ${objectName}`);

          const createResponse = await handleCreateClass(connection, {
            class_name: objectName,
            package_name: packageName,
            source_code: params.source_code,
            activate: true,
            ...(transportRequest && { transport_request: transportRequest }),
            session_id: session.session_id,
            session_state: session.session_state
          });

          // Handle response, update session, log success
          // ...
          return createData;
        },
        update: async (context: TesterContext) => {
          // Similar pattern for update
        },
        delete: async (context: TesterContext) => {
          // Similar pattern for delete
        }
      }
    );
    await tester.beforeAll();
  });

  it('should test all Class high-level handlers', async () => {
    await tester.run();
  });
});
```

**See**: `src/__tests__/integration/class/ClassHighHandlers.example.ts` for complete example.

## Progress Summary

### Phase 8: Handler Context Refactoring Status

**Overall Progress**: ~95% Complete

**Summary**:
- ✅ All handler signatures updated to use `HandlerContext` (150+ handlers)
- ✅ All handlers use `logger` from context (Logger Cleanup completed - 30 files)
- ✅ HandlerContext interface created and exported
- ✅ BaseHandlerGroup updated to use context
- 🔄 Handler registration infrastructure (mcp_handlers.ts) - in progress by user
- ⏳ Test workflow functions - pending update to pass context

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
- **mcp_handlers.ts**: Context parameter added, registration calls being updated by user
- **Remaining read-only handlers**: None (all 30+ completed!) ✅
- **Remaining high-level handlers**: None (all completed!) ✅
- **Remaining low-level handlers**: None (all completed!) ✅

#### Pending ⏳
- Update all handler group subclasses to use context (user is working on this)
- Update test workflow functions to pass context (in progress)
- Update any internal handler-to-handler calls
- **Logger Cleanup**: ✅ **COMPLETED** - All handlers now use `logger` from `HandlerContext` instead of `handlerLogger`

## Benefits

1. **Consistency**: All tests follow the same pattern
2. **Maintainability**: Changes to test infrastructure in one place
3. **Connection Management**: Unified AuthBroker-based connection creation
4. **Logging**: Consistent prefixes for easy debugging
5. **Reduced Duplication**: Common logic in base class
6. **Type Safety**: TypeScript ensures correct usage

## Notes

- All testers must use `createTestConnectionAndSession()` from `sessionHelpers.ts`
- **Current**: Connection is always passed as first argument to handlers
- **Future (Phase 8)**: Context (with connection and logger) will be passed as first argument to handlers
- Session state is managed automatically
- Cleanup is handled automatically in `afterEach`/`afterAll`
- Test configuration is loaded from `test-config.yaml` via config helpers
- Cleanup parameters (`skip_cleanup`, `cleanup_after`) from YAML are now properly respected, including parameters from parameter groups
