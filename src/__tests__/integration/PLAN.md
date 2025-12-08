# Integration Tests Plan for Low-Level Handlers

## Overview

This document outlines the plan for creating integration tests for all low-level handlers in `mcp-abap-adt`.

## Test Structure

### Test Organization

Tests are organized by object type, similar to builder tests in `adt-clients`:

```
src/__tests__/integration/
├── README.md                    # This file
├── PLAN.md                      # Test plan (this file)
├── helpers/
│   ├── testHelpers.ts          # ✅ Common test utilities
│   ├── sessionHelpers.ts       # ✅ Session management helpers
│   └── configHelpers.ts        # ✅ Configuration loading
├── class/
│   └── ClassLowHandlers.test.ts # ✅ Example test (created)
├── program/
│   └── ProgramLowHandlers.test.ts
├── interface/
│   └── InterfaceLowHandlers.test.ts
├── functionGroup/
│   └── FunctionGroupLowHandlers.test.ts
├── functionModule/
│   └── FunctionModuleLowHandlers.test.ts
├── domain/
│   ├── DomainLowHandlers.test.ts
│   └── DomainHighHandlers.test.ts
├── dataElement/
│   └── DataElementLowHandlers.test.ts
├── structure/
│   └── StructureLowHandlers.test.ts
├── table/
│   └── TableLowHandlers.test.ts
├── view/
│   └── ViewLowHandlers.test.ts
├── package/
│   └── PackageLowHandlers.test.ts
├── behaviorDefinition/
│   └── BehaviorDefinitionLowHandlers.test.ts
└── metadataExtension/
    └── MetadataExtensionLowHandlers.test.ts
```

## Test Pattern for Each Object Type

Each test file should test the complete workflow:

1. **GetSession** - Get initial session
2. **Validate** - Validate object name
3. **Create** - Create object
4. **Lock** - Lock object
5. **Update** - Update object (source code, metadata, etc.)
6. **Unlock** - Unlock object
7. **Activate** - Activate object
8. **Delete** - Cleanup (delete test object)

## Key Test Requirements

### ✅ Session Management
- Always get session at the start (`handleGetSession`)
- Update `session_state` after each operation
- **CRITICAL**: Use `session_id` and `session_state` from Lock response for Update and Unlock

### ✅ Error Handling
- Check `response.isError` before parsing
- Handle "already exists" errors gracefully
- Always cleanup in `finally` blocks

### ✅ Configuration
- Use `test-config.yaml` from `adt-clients` (shared configuration)
- Load test cases using `getEnabledTestCase()`
- Use `getTimeout()` and `getOperationDelay()` for timing

### ✅ Cleanup
- Always delete test objects in `afterAll` or `finally`
- Try to unlock before delete if object is locked
- Handle cleanup errors gracefully (log warnings, don't fail test)

## Test Cases to Implement

### Priority 1 (Core Objects)
- [x] **Class** - `ClassLowHandlers.test.ts` ✅
- [x] **Program** - `ProgramLowHandlers.test.ts` ✅
- [x] **Interface** - `InterfaceLowHandlers.test.ts` ✅
- [x] **FunctionGroup** - `FunctionGroupLowHandlers.test.ts` ✅
- [x] **FunctionModule** - `FunctionModuleLowHandlers.test.ts` ✅

### Priority 2 (Dictionary Objects)
- [x] **Domain** - `DomainLowHandlers.test.ts` ✅
- [x] **Domain (High-Level)** - `DomainHighHandlers.test.ts` ✅
- [x] **DataElement** - `DataElementLowHandlers.test.ts` ✅
- [x] **Structure** - `StructureLowHandlers.test.ts` ✅
- [x] **Table** - `TableLowHandlers.test.ts` ✅
- [x] **View** - `ViewLowHandlers.test.ts` ✅

### Priority 3 (Other Objects)
- [x] **Package** - `PackageLowHandlers.test.ts` ✅
- [x] **BehaviorDefinition** - `BehaviorDefinitionLowHandlers.test.ts` ✅
- [x] **MetadataExtension** - `MetadataExtensionLowHandlers.test.ts` ✅

## Test Configuration

Tests use the same `test-config.yaml` as `adt-clients`, but with handler-specific test cases:

```yaml
# Example: Class low-level handler test case
create_class_low:
  test_cases:
    - name: "full_workflow"
      enabled: true
      params:
        class_name: "ZADT_BLD_CLS01"
        package_name: "ZADT_BLD_PKG01"
        description: "Test class for low-level handler"
        source_code: |
          CLASS ZADT_BLD_CLS01 DEFINITION
            PUBLIC
            FINAL
            CREATE PUBLIC.
            ...
          ENDCLASS.
```

## Running Tests

```bash
# Run all integration tests
npm test -- --testPathPattern=integration

# Run specific object type
npm test -- --testPathPattern=integration/class

# Run with debug logs
DEBUG_ADT_TESTS=true npm test -- --testPathPattern=integration/class
```

## Implementation Status

- [x] Test infrastructure (helpers, config)
- [x] Example test (Class)
- [x] All Priority 1 tests ✅
- [x] Priority 2 tests (Domain, DataElement, Table, View, Structure) ✅
- [x] All Priority 3 tests ✅

## Next Steps

1. Copy `ClassLowHandlers.test.ts` as template for other object types
2. Adapt test cases for each object type (different handlers, parameters)
3. Add test cases to `test-config.yaml` for each handler
4. Run tests and fix any issues
5. Document any object-type-specific requirements

## Notes

- Tests should be independent (can run in any order)
- Tests should clean up after themselves
- Tests should handle missing configuration gracefully (skip with warning)
- Tests should use appropriate timeouts for long-running operations
- Tests should add delays between operations to allow SAP to process changes

## Session & Lock Persistence Roadmap

- [ ] Read config: support `session_config` / `lock_config` (dirs, persist flags) in helpers (via `configHelpers` getters).
- [ ] Implement persistence helper: new `helpers/persistenceHelpers.ts` with `saveSessionSnapshot`, `saveLockSnapshot` (JSON, base64 for heavy fields), `cleanupSessionSnapshot`.
- [ ] Wire tests: call persistence helpers from cleanup/finally blocks where `session`/`lock_handle` are available.
- [ ] Ensure files are written for every test run (last-resort diagnostics).
- [ ] Add cleanup: remove session files on successful tests when `cleanup_session_after_test=true`; define policy for lock files (keep unless explicitly disabled).
- [ ] Update template/docs (if needed) with persisted file paths/format and usage notes.
