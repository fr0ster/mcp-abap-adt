# Remaining Tasks Summary

## Overview
This document summarizes all remaining tasks from the Test Refactoring Roadmap.

## Phase 5: Refactor Existing Tests
**Status**: 2 tasks remaining

- [ ] **Refactor `BehaviorDefinitionHighHandlers.test.ts`**
  - [ ] Replace with `HighTester`

- [ ] **Refactor `BehaviorImplementationLowHandlers.test.ts`**
  - [ ] Replace with `LowTester` (Note: Uses handleCreateClass, handleCheckClass, handleLockBehaviorImplementation, handleUnlockClass, handleActivateClass, handleDeleteClass - may need custom workflow)

- [ ] **Refactor read-only tests (if any)**
  - [ ] Replace with `ReadOnlyTester`

## Phase 6: Testing & Validation
**Status**: All tasks pending

- [ ] Run all refactored tests
- [ ] Verify connection creation via AuthBroker works
- [ ] Verify session management works correctly
- [ ] Verify cleanup works correctly
- [ ] Verify logging prefixes work
- [ ] Fix any remaining issues
- [ ] Update documentation

## Phase 7: Convert Tests to Workflow Functions (Lambdas)
**Status**: 1/22 high-level tests, 0/11 low-level tests converted

### High-Level Tests (HighTester)
- [x] Convert `ClassHighHandlers.test.ts` to workflow functions ✅
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

### Low-Level Tests (LowTester)
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

### Read-Only Tests (ReadOnlyTester)
- [ ] Convert read-only tests to workflow functions (if any)

## Phase 8: Update Handler Calls
**Status**: 3 tasks remaining

- [ ] **Update test workflow functions to pass context**
  - Currently workflow functions receive `TesterContext` which contains `connection` and `logger`
  - Need to update to pass `HandlerContext` (with `connection` and `logger`) to handlers
  - Pattern: `handler(connection, args)` → `handler(context, args)`

- [ ] **Update direct handler calls in tests**
  - Find all direct handler calls in tests that still use `connection` parameter
  - Update to use `context` parameter

- [ ] **Update any internal handler-to-handler calls**
  - Check if any handlers call other handlers internally
  - Update to use `context` parameter

## Summary Statistics

- **Phase 5**: 3 tasks remaining (2 test files + read-only tests)
- **Phase 6**: 7 tasks remaining (all validation tasks)
- **Phase 7**: 21 tasks remaining (10 high-level + 11 low-level + read-only)
- **Phase 8**: 3 tasks remaining (all handler call updates)

**Total**: 34 tasks remaining

## Priority Order

1. **Phase 8** - Update test workflow functions to pass context (blocks Phase 7 completion)
2. **Phase 5** - Complete remaining test refactoring
3. **Phase 7** - Convert remaining tests to workflow functions
4. **Phase 6** - Final validation and documentation

## Notes

- All handlers now use `HandlerContext` instead of `connection` parameter ✅
- All handler groups use context correctly ✅
- MCP server handler registration uses context ✅
- Test workflow functions currently use `TesterContext` which needs to be updated to pass `HandlerContext` to handlers
