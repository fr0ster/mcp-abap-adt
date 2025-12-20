# Test Workflow Context Update Roadmap

## Goal
Update all test workflow functions to use `createHandlerContext` helper, which includes logger in HandlerContext only if `DEBUG_HANDLERS=true`.

## Implementation

### Helper Function
- [x] Create `createHandlerContext` helper in `testHelpers.ts` ✅
  - [x] Accepts `{ connection, logger }` from TesterContext
  - [x] Returns `HandlerContext` with `connection` always
  - [x] Includes `logger` only if `DEBUG_HANDLERS=true`

### Updated Tests (Examples)
- [x] `ClassHighHandlers.test.ts` ✅
- [x] `ClassHighHandlers.example.ts` ✅

### High-Level Tests (HighTester) - Update Workflow Functions
- [ ] `DataElementHighHandlers.test.ts`
  - [ ] Import `createHandlerContext` from testHelpers
  - [ ] Replace `{ connection, logger }` with `createHandlerContext({ connection, logger })` in all handler calls
- [ ] `DomainHighHandlers.test.ts`
- [ ] `InterfaceHighHandlers.test.ts`
- [ ] `ProgramHighHandlers.test.ts`
- [ ] `StructureHighHandlers.test.ts`
- [ ] `TableHighHandlers.test.ts`
- [ ] `ViewHighHandlers.test.ts`
- [ ] `BehaviorDefinitionHighHandlers.test.ts`
- [ ] `BehaviorImplementationHighHandlers.test.ts`
- [ ] `ServiceDefinitionHighHandlers.test.ts`

### Low-Level Tests (LowTester) - Update Workflow Functions
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

### Read-Only Tests (ReadOnlyTester) - Update Workflow Functions
- [ ] Update read-only tests (if any use workflow functions)

### Direct Handler Calls (Non-Workflow Function Tests)
- [ ] `ClassUnitTestHandlers.test.ts` - Update direct handler calls
- [ ] `ClassCrudClientDirect.test.ts` - Update direct handler calls
- [ ] Any other tests with direct handler calls

## Pattern to Apply

**Before:**
```typescript
const response = await handleCreateClass({ connection, logger }, args);
```

**After:**
```typescript
const handlerContext = createHandlerContext({ connection, logger });
const response = await handleCreateClass(handlerContext, args);
```

## Notes

- Logger is included in HandlerContext only if `DEBUG_HANDLERS=true`
- All handlers use optional chaining for logger (`logger?.info()`, etc.)
- This allows tests to control handler logging via environment variable
- Helper function ensures consistent context creation across all tests
