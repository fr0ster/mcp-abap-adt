# Integration Tests for Low-Level Handlers

This directory contains integration tests for low-level MCP handlers. These tests verify that handlers work correctly with real SAP systems.

## Overview

Integration tests for low-level handlers are similar to builder tests in `@mcp-abap-adt/adt-clients`, but they test the handler functions directly instead of using builders.

## Test Structure

### Directory Organization

```
src/__tests__/integration/
├── README.md (this file)
├── helpers/
│   ├── testHelpers.ts          # Common test utilities
│   ├── sessionHelpers.ts        # Session management helpers
│   └── configHelpers.ts        # Configuration loading
├── class/
│   └── ClassLowHandlers.test.ts # Tests for all class low-level handlers
├── program/
│   └── ProgramLowHandlers.test.ts
├── interface/
│   └── InterfaceLowHandlers.test.ts
├── functionGroup/
│   └── FunctionGroupLowHandlers.test.ts
├── domain/
│   └── DomainLowHandlers.test.ts
└── ... (other object types)
```

## Test Pattern

Each test file follows this pattern:

1. **Setup**: Load configuration, create connection, get session
2. **Test Workflow**: Execute handler functions in sequence (GetSession → Validate → Create → Lock → Update → Unlock → Activate)
3. **Cleanup**: Delete test objects, reset connection

## Example Test Structure

```typescript
import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleValidateClassLow } from '../../../handlers/class/low/handleValidateClass';
import { handleCreateClassLow } from '../../../handlers/class/low/handleCreateClass';
import { handleLockClassLow } from '../../../handlers/class/low/handleLockClass';
import { handleUpdateClassLow } from '../../../handlers/class/low/handleUpdateClass';
import { handleUnlockClassLow } from '../../../handlers/class/low/handleUnlockClass';
import { handleActivateClassLow } from '../../../handlers/class/low/handleActivateClass';
import { handleDeleteClassLow } from '../../../handlers/class/low/handleDeleteClass';

describe('Class Low-Level Handlers Integration', () => {
  let sessionId: string | null = null;
  let sessionState: any = null;
  
  beforeAll(async () => {
    // Get session
    const sessionResult = await handleGetSession({});
    const sessionData = JSON.parse(sessionResult.content[0].text);
    sessionId = sessionData.session_id;
    sessionState = sessionData.session_state;
  });
  
  it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
    const className = 'ZADT_TEST_CLASS_001';
    const packageName = 'ZOK_LOCAL';
    
    // 1. Validate
    const validateResult = await handleValidateClassLow({
      class_name: className,
      package_name: packageName,
      session_id: sessionId,
      session_state: sessionState
    });
    // Update session state from response
    const validateData = JSON.parse(validateResult.content[0].text);
    sessionState = validateData.session_state;
    
    // 2. Create
    const createResult = await handleCreateClassLow({
      class_name: className,
      description: 'Test class',
      package_name: packageName,
      session_id: sessionId,
      session_state: sessionState
    });
    const createData = JSON.parse(createResult.content[0].text);
    sessionState = createData.session_state;
    
    // 3. Lock
    const lockResult = await handleLockClassLow({
      class_name: className,
      session_id: sessionId,
      session_state: sessionState
    });
    const lockData = JSON.parse(lockResult.content[0].text);
    const lockHandle = lockData.lock_handle;
    // CRITICAL: Save session from Lock response
    const lockSessionId = lockData.session_id;
    const lockSessionState = lockData.session_state;
    
    // 4. Update
    const updateResult = await handleUpdateClassLow({
      class_name: className,
      source_code: 'CLASS ... ENDCLASS.',
      lock_handle: lockHandle,
      session_id: lockSessionId,  // ← From Lock response
      session_state: lockSessionState  // ← From Lock response
    });
    
    // 5. Unlock
    const unlockResult = await handleUnlockClassLow({
      class_name: className,
      lock_handle: lockHandle,
      session_id: lockSessionId,  // ← From Lock response
      session_state: lockSessionState  // ← From Lock response
    });
    
    // 6. Activate
    const activateResult = await handleActivateClassLow({
      class_name: className,
      session_id: sessionId,
      session_state: sessionState
    });
    
    expect(activateResult.isError).toBe(false);
  });
  
  afterAll(async () => {
    // Cleanup: Delete test object
    if (sessionId && sessionState) {
      await handleDeleteClassLow({
        class_name: 'ZADT_TEST_CLASS_001',
        session_id: sessionId,
        session_state: sessionState
      });
    }
  });
});
```

## Key Differences from Builder Tests

1. **Direct Handler Calls**: Tests call handler functions directly, not builders
2. **Manual Session Management**: Tests must manually manage `session_id` and `session_state`
3. **Response Parsing**: Tests must parse JSON responses from handlers
4. **Session State Updates**: Tests must update `session_state` after each operation
5. **Lock Session Handling**: Tests must use `session_id` and `session_state` from Lock response

## Configuration

Tests use the same `test-config.yaml` as builder tests in `adt-clients`, but with handler-specific test cases:

```yaml
# Handler-specific test cases
create_class_low:
  test_cases:
    - name: "full_workflow"
      enabled: true
      params:
        class_name: "ZADT_BLD_CLS01"
        package_name: "ZADT_BLD_PKG01"
        description: "Test class for low-level handler"
```

## Running Tests

```bash
# Run all integration tests
npm test -- --testPathPattern=integration
# or use shortcut:
npm run test:integration

# Run only high-level handler tests
npm run test:high

# Run only low-level handler tests
npm run test:low

# Run specific object type tests
npm test -- --testPathPattern=integration/class

# Run with debug logs
DEBUG_TESTS=true npm test -- --testPathPattern=integration/class
DEBUG_HANDLERS=true npm test -- --testPathPattern=integration/class
DEBUG_ADT_LIBS=true npm test -- --testPathPattern=integration/class
```

## Test Helpers

Common helpers are available in `helpers/`:

- `testHelpers.ts`: Parse handler responses, extract session state, etc.
- `sessionHelpers.ts`: Session management utilities
- `configHelpers.ts`: Load test configuration from YAML

## Important Notes

1. **Session Management**: Always use `session_id` and `session_state` from Lock response for Update and Unlock operations
2. **Error Handling**: Always check `result.isError` before parsing response
3. **Cleanup**: Always delete test objects in `afterAll` to avoid cluttering the system
4. **Timeouts**: Use appropriate timeouts for long-running operations
5. **Delays**: Add delays between operations to allow SAP to process changes

## Related Documentation

- [Builder Tests in adt-clients](../../../../mcp-abap-adt-clients/src/__tests__/integration/README.md) - Reference for test patterns
- [Session Management Guide](../../../doc/user-guide/scenarios/SESSION_MANAGEMENT.md) - Understanding sessions
- [Creating Classes Guide](../../../doc/user-guide/scenarios/CREATING_CLASSES.md) - Workflow examples

