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

## Benefits

1. **Consistency**: All tests follow the same pattern
2. **Maintainability**: Changes to test infrastructure in one place
3. **Connection Management**: Unified AuthBroker-based connection creation
4. **Logging**: Consistent prefixes for easy debugging
5. **Reduced Duplication**: Common logic in base class
6. **Type Safety**: TypeScript ensures correct usage

## Notes

- All testers must use `createTestConnectionAndSession()` from `sessionHelpers.ts`
- Connection is always passed as first argument to handlers
- Session state is managed automatically
- Cleanup is handled automatically in `afterEach`/`afterAll`
- Test configuration is loaded from `test-config.yaml` via config helpers
