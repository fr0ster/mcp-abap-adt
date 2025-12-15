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
- [ ] Create `BaseTester` abstract class
  - [ ] Constructor with test name, log prefix, handler name
  - [ ] `beforeAll()` - load config, create connection via AuthBroker
  - [ ] `afterAll()` - cleanup
  - [ ] `beforeEach()` - prepare test case
  - [ ] `afterEach()` - cleanup test artifacts
  - [ ] Properties: `connection`, `session`, `hasConfig`, `testCase`
  - [ ] Method: `createConnection()` - uses `createTestConnectionAndSession()`
  - [ ] Method: `loadTestConfig()` - wrapper for config helpers
  - [ ] Method: `getLogger()` - returns logger with prefix

### Phase 2: LowTester Implementation
- [ ] Create `LowTester` class extending `BaseTester`
  - [ ] Constructor accepts handler name, test case name
  - [ ] `run()` method - executes full workflow:
    - [ ] Validate → Create → Lock → Update → Unlock → Activate
  - [ ] Method: `runValidate()` - calls handler with connection
  - [ ] Method: `runCreate()` - calls handler with connection
  - [ ] Method: `runLock()` - calls handler with connection
  - [ ] Method: `runUpdate()` - calls handler with connection
  - [ ] Method: `runUnlock()` - calls handler with connection
  - [ ] Method: `runActivate()` - calls handler with connection
  - [ ] Method: `runDelete()` - cleanup handler call
  - [ ] Method: `cleanup()` - unlock and delete if needed
  - [ ] Track: `lockHandle`, `lockSession`, `objectWasCreated`

### Phase 3: HighTester Implementation
- [ ] Create `HighTester` class extending `BaseTester`
  - [ ] Constructor accepts handler name, test case name
  - [ ] `run()` method - executes high-level workflow:
    - [ ] Create (with full source code)
    - [ ] Update (with modified source code)
  - [ ] Method: `runCreate()` - calls high-level create handler
  - [ ] Method: `runUpdate()` - calls high-level update handler
  - [ ] Method: `runDelete()` - cleanup handler call
  - [ ] Handle source code management internally

### Phase 4: ReadOnlyTester Implementation
- [ ] Create `ReadOnlyTester` class extending `BaseTester`
  - [ ] Constructor accepts handler name, test case name
  - [ ] `run()` method - executes read-only operations:
    - [ ] Get object info
    - [ ] Validate response format
  - [ ] Method: `runGet()` - calls read-only handler
  - [ ] Method: `validateResponse()` - checks MCP response format
  - [ ] No cleanup needed (read-only)

### Phase 5: Refactor Existing Tests
- [ ] Refactor `BehaviorDefinitionLowHandlers.test.ts`
  - [ ] Replace test structure with `LowTester`
  - [ ] Use `tester.run()` instead of manual workflow
- [ ] Refactor `BehaviorDefinitionHighHandlers.test.ts`
  - [ ] Replace with `HighTester`
- [ ] Refactor `ClassLowHandlers.test.ts`
  - [ ] Replace with `LowTester`
- [ ] Refactor `ClassHighHandlers.test.ts`
  - [ ] Replace with `HighTester`
- [ ] Refactor `DataElementLowHandlers.test.ts`
  - [ ] Replace with `LowTester`
- [ ] Refactor `DataElementHighHandlers.test.ts`
  - [ ] Replace with `HighTester`
- [ ] Refactor `DomainLowHandlers.test.ts`
  - [ ] Replace with `LowTester`
- [ ] Refactor `DomainHighHandlers.test.ts`
  - [ ] Replace with `HighTester`
- [ ] Refactor `FunctionModuleLowHandlers.test.ts`
  - [ ] Replace with `LowTester`
- [ ] Refactor `FunctionHighHandlers.test.ts`
  - [ ] Replace with `HighTester`
- [ ] Refactor `InterfaceLowHandlers.test.ts`
  - [ ] Replace with `LowTester`
- [ ] Refactor `InterfaceHighHandlers.test.ts`
  - [ ] Replace with `HighTester`
- [ ] Refactor `ProgramLowHandlers.test.ts`
  - [ ] Replace with `LowTester`
- [ ] Refactor `StructureLowHandlers.test.ts`
  - [ ] Replace with `LowTester`
- [ ] Refactor `StructureHighHandlers.test.ts`
  - [ ] Replace with `HighTester`
- [ ] Refactor `TableLowHandlers.test.ts`
  - [ ] Replace with `LowTester`
- [ ] Refactor `ViewLowHandlers.test.ts`
  - [ ] Replace with `LowTester`
- [ ] Refactor `ViewHighHandlers.test.ts`
  - [ ] Replace with `HighTester`
- [ ] Refactor `MetadataExtensionLowHandlers.test.ts`
  - [ ] Replace with `LowTester`
- [ ] Refactor `BehaviorImplementationLowHandlers.test.ts`
  - [ ] Replace with `LowTester`
- [ ] Refactor `BehaviorImplementationHighHandlers.test.ts`
  - [ ] Replace with `HighTester`
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

### HighTester Example
```typescript
describe('Class High-Level Handlers Integration', () => {
  let tester: HighTester;

  beforeAll(async () => {
    tester = new HighTester(
      'class_high',
      'create_and_update',
      'class-high'
    );
    await tester.beforeAll();
  });

  it('should create and update class', async () => {
    await tester.run();
  });
});
```

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
