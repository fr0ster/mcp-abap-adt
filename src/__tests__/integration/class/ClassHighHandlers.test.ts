/**
 * Integration tests for Class High-Level Handlers
 *
 * Tests all high-level handlers for Class module:
 * - CreateClass (high-level) - handles create, lock, update, check, unlock, activate
 * - UpdateClass (high-level) - handles lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/class
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleCreateClass } from '../../../handlers/class/high/handleCreateClass';
import { handleUpdateClass } from '../../../handlers/class/high/handleUpdateClass';
import { handleDeleteClass } from '../../../handlers/class/low/handleDeleteClass';
import { AbapConnection, createAbapConnection } from '@mcp-abap-adt/connection';
import { generateSessionId } from '../../../lib/sessionUtils';

import {
  parseHandlerResponse,
  delay,
  debugLog
} from '../helpers/testHelpers';
import {
  updateSessionFromResponse,
  SessionInfo
} from '../helpers/sessionHelpers';
import {
  getEnabledTestCase,
  getTimeout,
  getOperationDelay,
  resolvePackageName,
  resolveTransportRequest,
  loadTestEnv,
  getCleanupAfter,
  getSessionConfig,
  getSapConfigFromEnv
} from '../helpers/configHelpers';
import { createDiagnosticsTracker } from '../helpers/persistenceHelpers';

// Load environment variables
// loadTestEnv will be called in beforeAll

describe('Class High-Level Handlers Integration', () => {
  let hasConfig = false;

  beforeAll(async () => {
    // Load environment variables before creating connections
    await loadTestEnv();
    hasConfig = true;
  });

  it('should test all Class high-level handlers', async () => {
    if (!hasConfig) {
      console.log('⏭️  Skipping test: No SAP configuration');
      return;
    }

    // Create a separate connection for this test (not using getManagedConnection)
    let connection: AbapConnection | null = null;
    let session: SessionInfo | null = null;
    let diagnosticsTracker: ReturnType<typeof createDiagnosticsTracker> | null = null;

    try {
      // Get configuration from environment variables
      const config = getSapConfigFromEnv();

      // Create logger for connection (only logs when DEBUG_CONNECTORS is enabled)
      const connectionLogger = {
        debug: process.env.DEBUG_CONNECTORS === 'true' ? console.log : () => {},
        info: process.env.DEBUG_CONNECTORS === 'true' ? console.log : () => {},
        warn: process.env.DEBUG_CONNECTORS === 'true' ? console.warn : () => {},
        error: process.env.DEBUG_CONNECTORS === 'true' ? console.error : () => {},
        csrfToken: process.env.DEBUG_CONNECTORS === 'true' ? console.log : () => {}
      };

      // Create connection directly (same as in adt-clients tests)
      connection = createAbapConnection(config, connectionLogger);

      // Connect to get session state
      await connection.connect();

      // Generate session ID
      const sessionId = generateSessionId();

      // Get session state directly from connection
      const sessionState = connection.getSessionState();

      if (!sessionState) {
        throw new Error('Failed to get session state. Connection may not be properly initialized.');
      }

      session = {
        session_id: sessionId,
        session_state: {
          cookies: sessionState.cookies || '',
          csrf_token: sessionState.csrfToken || '',
          cookie_store: sessionState.cookieStore || {}
        }
      };

      debugLog('CONNECTION', `Created separate connection for test`, {
        url: config.url,
        authType: config.authType,
        hasClient: !!config.client,
        session_id: session.session_id
      });

      // Diagnostics tracker (persists session immediately)
      diagnosticsTracker = createDiagnosticsTracker('class_high_handlers', testCase, session, {
        handler: 'create_class',
        object_name: className
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('⚠️ Skipping test: Failed to create connection', errorMessage);
      return;
    }

    // Get test case configuration
    const testCase = getEnabledTestCase('create_class', 'builder_class');
    if (!testCase) {
      console.log('⏭️  Skipping test: No test case configuration');
      return;
    }

    const className = testCase.params.class_name;
    const packageName = resolvePackageName(testCase);
    const transportRequest = resolveTransportRequest(testCase);
    const description = testCase.params.description || `Test class for high-level handler`;
    const sourceCode = testCase.params.source_code || `CLASS ${className} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    METHODS: test_method.
ENDCLASS.

CLASS ${className} IMPLEMENTATION.
  METHOD test_method.
    WRITE: / 'Hello from ${className}'.
  ENDMETHOD.
ENDCLASS.`;

    // Track creation state for cleanup
    let classCreated = false;
    let classLocked = false;
    let lockHandle: string | null = null;

    try {
      // Step 1: Test CreateClass (High-Level)
      // High-level handler executes: Create → Lock → Update → Check → Unlock → Activate
      debugLog('CREATE_START', `Starting high-level class creation for ${className}`, {
        session_id: session.session_id,
        package_name: packageName,
        transport_request: transportRequest,
        description
      });
      debugLog('CREATE_INFO', 'High-level handler will execute: Create → Lock → Update → Check → Unlock → Activate', {
        note: 'All steps are logged via handlerLogger when DEBUG_TESTS=true'
      });

      let createResponse;
      try {
        debugLog('HANDLER_CALL', `Calling handleCreateClass`, {
          class_name: className,
          package_name: packageName,
          transport_request: transportRequest,
          activate: true
        });

        createResponse = await handleCreateClass({
          class_name: className,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          superclass: testCase.params.superclass,
          final: testCase.params.final || false,
          abstract: testCase.params.abstract || false,
          create_protected: testCase.params.create_protected || false,
          source_code: sourceCode,
          activate: true
        });

        debugLog('HANDLER_RESPONSE', `Received response from handleCreateClass`, {
          isError: createResponse.isError,
          hasContent: createResponse.content && createResponse.content.length > 0
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        debugLog('HANDLER_ERROR', `Error during handleCreateClass`, {
          error: errorMsg,
          errorType: error.constructor?.name || 'Unknown'
        });
        // If class already exists, that's okay - we'll skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName')) {
          const reason = errorMsg.includes('already exists') ? ' (object already exists)' : ' (validation failed)';
          const skipReason = `CreateClass operation for class ${className} failed validation${reason}: ${errorMsg}`;
          console.log(`⏭️  SKIP: ${skipReason}`);
          // Throw error to mark test as failed (not passed) when validation fails
          // This prevents test from being marked as "passed" when it should be skipped
          throw new Error(`SKIP: ${skipReason}`);
        }
        throw error;
      }

      if (createResponse.isError) {
        const errorMsg = createResponse.content[0]?.text || 'Unknown error';
        // If validation fails (class already exists or invalid), skip test
        if (errorMsg.includes('already exists') ||
            errorMsg.includes('ExceptionResourceAlreadyExists') ||
            errorMsg.includes('ResourceAlreadyExists') ||
            errorMsg.includes('InvalidClifName') ||
            errorMsg.includes('InvalidObjName')) {
          const reason = errorMsg.includes('already exists') ||
                       errorMsg.includes('ExceptionResourceAlreadyExists') ||
                       errorMsg.includes('ResourceAlreadyExists')
            ? ' (object already exists)'
            : ' (validation failed)';
          const skipReason = `CreateClass operation for class ${className} failed validation${reason}: ${errorMsg}`;
          console.log(`⏭️  SKIP: ${skipReason}`);
          // Throw error to mark test as failed (not passed) when validation fails
          // This prevents test from being marked as "passed" when it should be skipped
          throw new Error(`SKIP: ${skipReason}`);
        }
        // For other errors, throw
        throw new Error(`Create failed: ${errorMsg}`);
      }

      const createData = parseHandlerResponse(createResponse);
      expect(createData.success).toBe(true);
      expect(createData.class_name).toBe(className);

      // Mark class as created successfully
      classCreated = true;
      // High-level handler does lock internally, so mark as locked
      classLocked = true;

      debugLog('CREATE_COMPLETE', 'High-level class creation completed successfully', {
        class_name: createData.class_name,
        success: createData.success,
        status: createData.status || 'unknown',
        package: createData.package || packageName
      });

      await delay(getOperationDelay('create', testCase));
      console.log(`✅ High-level class creation completed successfully for ${className}`);

      // Step 2: Test UpdateClass (High-Level)
      // High-level handler executes: Validate → Lock → Update → Check → Unlock → Activate
      const updatedSourceCode = `CLASS ${className} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    METHODS: test_method,
             another_method.
ENDCLASS.

CLASS ${className} IMPLEMENTATION.
  METHOD test_method.
    WRITE: / 'Hello from ${className} (updated)'.
  ENDMETHOD.
  METHOD another_method.
    WRITE: / 'Another method'.
  ENDMETHOD.
ENDCLASS.`;

      debugLog('UPDATE_START', `Starting high-level class update for ${className}`, {
        session_id: session.session_id,
        sourceCodeLength: updatedSourceCode.length
      });
      debugLog('UPDATE_INFO', 'High-level handler will execute: Validate → Lock → Update → Check → Unlock → Activate', {
        note: 'All steps are logged via handlerLogger when DEBUG_TESTS=true'
      });

      let updateResponse;
      try {
        debugLog('HANDLER_CALL', `Calling handleUpdateClass`, {
          class_name: className,
          sourceCodeLength: updatedSourceCode.length,
          activate: true
        });

        updateResponse = await handleUpdateClass({
          class_name: className,
          source_code: updatedSourceCode,
          activate: true
        });

        debugLog('HANDLER_RESPONSE', `Received response from handleUpdateClass`, {
          isError: updateResponse.isError,
          hasContent: updateResponse.content && updateResponse.content.length > 0
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        debugLog('HANDLER_ERROR', `Error during handleUpdateClass`, {
          error: errorMsg,
          errorType: error.constructor?.name || 'Unknown'
        });
        // If class doesn't exist or other validation error, skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName') || errorMsg.includes('not found')) {
          const reason = errorMsg.includes('not found') ? ' (class does not exist)' : ' (validation failed)';
          const skipReason = `UpdateClass operation for class ${className} failed${reason}: ${errorMsg}`;
          console.log(`⏭️  SKIP: ${skipReason}`);
          // Throw error to mark test as failed (not passed) when validation fails
          // This prevents test from being marked as "passed" when it should be skipped
          throw new Error(`SKIP: ${skipReason}`);
        }
        throw new Error(`Update failed: ${errorMsg}`);
      }

      if (updateResponse.isError) {
        const errorMsg = updateResponse.content[0]?.text || 'Unknown error';
        debugLog('UPDATE_FAILED', `Update failed: ${errorMsg}`);
        // If class doesn't exist (500 error with "does not exist" message), skip test
        if (errorMsg.includes('does not exist') || errorMsg.includes('not found')) {
          const skipReason = `UpdateClass operation for class ${className} failed (class does not exist): ${errorMsg}`;
          console.log(`⏭️  SKIP: ${skipReason}`);
          throw new Error(`SKIP: ${skipReason}`);
        }
        throw new Error(`Update failed: ${errorMsg}`);
      }

      const updateData = parseHandlerResponse(updateResponse);
      expect(updateData.success).toBe(true);
      expect(updateData.class_name).toBe(className);

      debugLog('UPDATE_COMPLETE', 'High-level class update completed successfully', {
        class_name: updateData.class_name,
        success: updateData.success,
        steps_completed: updateData.steps_completed || [],
        activation_warnings: updateData.activation_warnings || []
      });

      await delay(getOperationDelay('update', testCase));
      console.log(`✅ High-level class update completed successfully for ${className}`);

    } catch (error: any) {
      // Check if this is a skip error (starts with "SKIP:")
      if (error.message && error.message.startsWith('SKIP:')) {
        // This is a skip error - rethrow to mark test as failed (not passed)
        // This prevents test from being marked as "passed" when it should be skipped
        throw error;
      }

      debugLog('TEST_ERROR', `Test failed: ${error.message}`, {
        error: error.message,
        stack: error.stack?.substring(0, 500) // Limit stack trace length
      });
      console.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Reset connection created for this test
      if (connection) {
        try {
          connection.reset();
          debugLog('CLEANUP', `Reset test connection`);
        } catch (resetError: any) {
          debugLog('CLEANUP_ERROR', `Failed to reset connection: ${resetError.message || resetError}`);
        }
      }

      if (session && className) {
        try {
          const shouldCleanup = getCleanupAfter(testCase);

          // Principle 1: If lock was done, unlock is mandatory
          // High-level handler handles unlock internally in case of errors,
          // but we try unlock here as a safety net for diagnostics
          if (classLocked) {
            try {
              debugLog('CLEANUP', `Attempting to unlock class ${className} (cleanup safety net)`, {
                class_name: className,
                session_id: session.session_id,
                class_created: classCreated,
                class_locked: classLocked
              });

              // Try to unlock using CrudClient directly
              // Note: High-level handler already handles unlock on error, but we try here as safety net
              if (!connection) {
                debugLog('CLEANUP', `Cannot unlock: connection not available`);
              } else {
                const { CrudClient } = await import('@mcp-abap-adt/adt-clients');
                const client = new CrudClient(connection);

                // Try unlock without lockHandle (CrudClient may have it stored internally)
                // If lockHandle was available, try with it first
                try {
                  if (lockHandle) {
                    await client.unlockClass({ className }, lockHandle);
                  } else {
                    await client.unlockClass({ className });
                  }
                  debugLog('CLEANUP', `Successfully unlocked class ${className} (cleanup safety net)`);
                  console.log(`🔓 Unlocked class ${className} (cleanup safety net)`);
                } catch (unlockErr: any) {
                  // If unlock fails, it might be already unlocked - this is OK
                  debugLog('CLEANUP', `Unlock attempt completed (may already be unlocked): ${className}`, {
                    error: unlockErr instanceof Error ? unlockErr.message : String(unlockErr)
                  });
                }
              }
            } catch (unlockError: any) {
              debugLog('CLEANUP', `Failed to unlock class ${className} (cleanup)`, {
                error: unlockError instanceof Error ? unlockError.message : String(unlockError)
              });
              // Don't warn - unlock may fail if class is already unlocked or doesn't exist
            }
          }

          // Delete class only if cleanup_after is true
          if (shouldCleanup) {
            try {
              const deleteResponse = await handleDeleteClass({
                class_name: className,
                transport_request: transportRequest
              });

              if (!deleteResponse.isError) {
                console.log(`🧹 Cleaned up test class: ${className}`);
              } else {
                const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
                console.warn(`⚠️  Failed to delete class ${className}: ${errorMsg}`);
              }
            } catch (deleteError: any) {
              debugLog('CLEANUP', `Exception during deleteClass for ${className}`, {
                error: deleteError instanceof Error ? deleteError.message : String(deleteError)
              });
              console.warn(`⚠️  Failed to cleanup test class ${className}: ${deleteError}`);
            }
          } else {
            console.log(`⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${className}`);
          }
        } catch (cleanupError) {
          debugLog('CLEANUP_ERROR', `Exception during cleanup: ${cleanupError}`, {
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          });
          console.warn(`⚠️  Failed to cleanup test class ${className}: ${cleanupError}`);
        }
      }

      // Cleanup persisted session snapshot if configured
      diagnosticsTracker?.cleanup();
    }
  }, getTimeout('long'));
});
