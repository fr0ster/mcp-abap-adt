# Testers - Workflow Functions Approach

## Overview

Testers (`HighTester`, `LowTester`, `ReadOnlyTester`) support two approaches for defining handler calls:

1. **Old approach**: Pass handler functions directly (backward compatible)
2. **New approach**: Pass workflow functions (lambdas) that receive tester context

## Why Workflow Functions?

The workflow functions approach allows:
- **Tests to define custom handler call logic** - how to build args, handle errors, add logging
- **Tester provides all infrastructure** - connection, session, logger, params, etc. from one place
- **Consistent setup** - all tests use the same connection/session/logger setup
- **Flexibility** - tests can add custom logic, retries, error handling

## TesterContext

All workflow functions receive a `TesterContext` object with:

```typescript
interface TesterContext {
  connection: AbapConnection;    // Connection to ABAP system
  session: SessionInfo;          // Current session (session_id, session_state)
  logger: LoggerWithExtras;      // Logger with icons and formatting
  objectName: string | null;     // Resolved object name
  params: any;                   // Test parameters from YAML
  packageName: string;            // Resolved package name
  transportRequest?: string;     // Resolved transport request
  lockHandle?: string | null;    // Lock handle (for LowTester)
  lockSession?: SessionInfo | null; // Lock session (for LowTester)
}
```

## Example: HighTester with Workflow Functions

```typescript
import { HighTester, type TesterContext } from '../helpers/testers/HighTester';
import { handleCreateClass } from '../../../handlers/class/high/handleCreateClass';
import { handleUpdateClass } from '../../../handlers/class/high/handleUpdateClass';
import { parseHandlerResponse, extractErrorMessage } from '../helpers/testHelpers';

const tester = new HighTester(
  'create_class',
  'builder_class',
  'class-high',
  {
    // Lambda that calls create handler with logging
    create: async (context: TesterContext) => {
      const { connection, session, logger, objectName, params, packageName, transportRequest } = context;
      
      logger.info(`   • create: ${objectName}`);

      const createArgs = {
        class_name: objectName,
        package_name: packageName,
        source_code: params.source_code,
        activate: true,
        ...(transportRequest && { transport_request: transportRequest }),
        session_id: session.session_id,
        session_state: session.session_state
      };

      const createResponse = await handleCreateClass(connection, createArgs);

      if (createResponse.isError) {
        const errorMsg = extractErrorMessage(createResponse);
        throw new Error(`Create failed: ${errorMsg}`);
      }

      const createData = parseHandlerResponse(createResponse);
      logger.success(`✅ create: ${objectName} completed successfully`);
      
      return createData;
    },

    // Lambda that calls update handler
    update: async (context: TesterContext) => {
      const { connection, session, logger, objectName, params } = context;
      
      logger.info(`   • update: ${objectName}`);

      const updateResponse = await handleUpdateClass(connection, {
        class_name: objectName,
        source_code: params.update_source_code,
        activate: true,
        session_id: session.session_id,
        session_state: session.session_state
      });

      if (updateResponse.isError) {
        const errorMsg = extractErrorMessage(updateResponse);
        throw new Error(`Update failed: ${errorMsg}`);
      }

      const updateData = parseHandlerResponse(updateResponse);
      logger.success(`✅ update: ${objectName} completed successfully`);
      
      return updateData;
    }
  }
);
```

## Example: LowTester with Workflow Functions

```typescript
import { LowTester, type TesterContext } from '../helpers/testers/LowTester';
import { handleCreateClass } from '../../../handlers/class/low/handleCreateClass';
import { handleLockClass } from '../../../handlers/class/low/handleLockClass';
// ... other handlers

const tester = new LowTester(
  'create_class_low',
  'full_workflow',
  'class-low',
  {
    create: async (context: TesterContext) => {
      const { connection, session, logger, objectName, params, packageName } = context;
      
      logger.info(`   • create: ${objectName}`);

      const createResponse = await handleCreateClass(connection, {
        class_name: objectName,
        package_name: packageName,
        source_code: params.source_code,
        session_id: session.session_id,
        session_state: session.session_state
      });

      // Handle response, update session, etc.
      return parseHandlerResponse(createResponse);
    },

    lock: async (context: TesterContext) => {
      const { connection, session, logger, objectName } = context;
      
      logger.info(`   • lock: ${objectName}`);

      const lockResponse = await handleLockClass(connection, {
        class_name: objectName,
        session_id: session.session_id,
        session_state: session.session_state
      });

      // Extract lock handle, update lockSession, etc.
      return parseHandlerResponse(lockResponse);
    },

    // ... other workflow functions
  }
);
```

## Benefits

1. **All infrastructure in one place**: Connection, session, logger, params come from tester
2. **Custom logic in tests**: Tests can add retries, custom error handling, logging
3. **Type safety**: `TesterContext` provides type-safe access to all infrastructure
4. **Backward compatible**: Old approach (passing handler functions) still works
5. **Consistent setup**: All tests use the same connection/session/logger setup

## Migration

To migrate from old approach to new approach:

1. Change handler functions to workflow functions (lambdas)
2. Use `context` parameter instead of `connection` and `args`
3. Access all infrastructure from `context` (connection, session, logger, params, etc.)
4. Add custom logging and error handling as needed

See `ClassHighHandlers.example.ts` for a complete example.
