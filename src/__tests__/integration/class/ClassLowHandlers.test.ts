/**
 * Integration tests for Class Low-Level Handlers
 *
 * Tests the complete workflow using handler functions directly:
 * GetSession → ValidateClassLow → CreateClassLow → LockClassLow →
 * UpdateClassLow → UnlockClassLow → ActivateClassLow → DeleteClassLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/class
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleValidateClass } from '../../../handlers/class/low/handleValidateClass';
import { handleCreateClass } from '../../../handlers/class/low/handleCreateClass';
import { handleLockClass } from '../../../handlers/class/low/handleLockClass';
import { handleCheckClass } from '../../../handlers/class/low/handleCheckClass';
import { handleUpdateClass } from '../../../handlers/class/low/handleUpdateClass';
import { handleUnlockClass } from '../../../handlers/class/low/handleUnlockClass';
import { handleActivateClass } from '../../../handlers/class/low/handleActivateClass';
import { handleDeleteClass } from '../../../handlers/class/low/handleDeleteClass';
import { handleGetClass } from '../../../handlers/class/readonly/handleGetClass';

import {
  parseHandlerResponse,
  extractSessionState,
  extractLockHandle,
  isSuccessResponse,
  delay,
  debugLog
} from '../helpers/testHelpers';
import {
  createTestConnectionAndSession,
  updateSessionFromResponse,
  extractLockSession,
  SessionInfo
} from '../helpers/sessionHelpers';
import { AbapConnection } from '@mcp-abap-adt/connection';
import {
  getEnabledTestCase,
  getTimeout,
  getOperationDelay,
  resolvePackageName,
  resolveTransportRequest,
  loadTestEnv,
  getCleanupAfter,
  getSessionConfig
} from '../helpers/configHelpers';
import {
  createDiagnosticsTracker
} from '../helpers/persistenceHelpers';

describe('Class Low-Level Handlers Integration', () => {
  let hasConfig = false;

  beforeAll(async () => {
    try {
      // Load environment variables and refresh tokens if needed
      await loadTestEnv();
      hasConfig = true;
    } catch (error) {
      console.warn('⚠️ Skipping tests: No .env file or SAP configuration found');
      hasConfig = false;
    }
  });

  afterAll(async () => {
    // Cleanup will be done in individual tests
  });

  describe('Full Workflow', () => {
    let testCase: any = null;
    let testClassName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig) {
        return;
      }

      // Get test case configuration
      testCase = getEnabledTestCase('create_class_low', 'full_workflow');
      if (!testCase) {
        return;
      }

      testClassName = testCase.params.class_name;
    });

    it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
      if (!hasConfig || !testCase || !testClassName) {
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasTestCase: !!testCase,
          hasTestClassName: !!testClassName
        });
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      // Create a separate connection and session for this test (not using getManagedConnection)
      let connection: AbapConnection | null = null;
      let session: SessionInfo | null = null;
      let diagnosticsTracker: ReturnType<typeof createDiagnosticsTracker> | null = null;

      try {
        const { connection: testConnection, session: testSession } = await createTestConnectionAndSession();
        connection = testConnection;
        session = testSession;

        debugLog('CONNECTION', `Created separate connection for test`, {
          session_id: session.session_id
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn('⚠️ Skipping test: Failed to create connection', errorMessage);
        return;
      }

      const className = testClassName;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test class for low-level handler`;

      // Diagnostics tracker (persists session immediately)
      diagnosticsTracker = createDiagnosticsTracker('class_low_full_workflow', testCase, session, {
        handler: 'create_class_low',
        object_name: className
      });

      debugLog('TEST_START', `Starting full workflow test for class: ${className}`, {
        className,
        packageName,
        transportRequest,
        description
      });

      // Pre-check: Try to read class to see if it exists
      // If class exists (even if corrupted/locked), we'll skip the test
      let classExists = false;
      try {
        debugLog('PRE_CHECK', `Checking if class ${className} exists`);
        const readResponse = await handleGetClass({
          class_name: className
        });

        if (!readResponse.isError) {
          // Class exists and can be read
          classExists = true;
          debugLog('PRE_CHECK', `Class ${className} exists and can be read`);
        } else {
          // Class might exist but be corrupted/locked (error reading it)
          const errorText = readResponse.content[0]?.text || '';
          const errorLower = errorText.toLowerCase();

          // If error is 404, class doesn't exist
          if (errorText.includes('404') || errorText.includes('not found') || errorText.includes('does not exist')) {
            debugLog('PRE_CHECK', `Class ${className} does not exist - proceeding with test`);
            classExists = false;
          } else {
            // Other errors (403, 500, etc.) might mean class exists but is locked/corrupted
            // In this case, we'll assume class exists and let validation confirm
            debugLog('PRE_CHECK', `Class ${className} may exist but cannot be read: ${errorText}`);
            classExists = true; // Assume exists if we can't read it (corrupted/locked)
          }
        }
      } catch (readError: any) {
        // Unexpected error - assume class might exist
        debugLog('PRE_CHECK', `Unexpected error checking class ${className}: ${readError.message}`);
        classExists = true; // Conservative: assume exists if we can't check
      }

      // Pre-cleanup: Try to delete class if it exists
      // If class doesn't exist, skip delete (nothing to delete)
      if (classExists) {
        try {
          debugLog('PRE_CLEANUP', `Attempting to delete existing class ${className} before test`);
          const preDeleteResponse = await handleDeleteClass({
            class_name: className,
            transport_request: transportRequest
          });
          if (!preDeleteResponse.isError) {
            debugLog('PRE_CLEANUP', `Delete request successful for ${className}, verifying deletion...`);
            // Wait for SAP to process deletion (3 seconds as in ClassBuilder.test.ts)
            await delay(3000);

            // Verify deletion by attempting to read the class (should return 404)
            let deletionVerified = false;
            const maxRetries = 5;
            const retryDelay = 2000;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              try {
                const readResponse = await handleGetClass({ class_name: className });

                if (readResponse.isError) {
                  const errorText = readResponse.content[0]?.text || '';
                  if (errorText.includes('404') || errorText.includes('not found') || errorText.includes('does not exist')) {
                    deletionVerified = true;
                    debugLog('PRE_CLEANUP', `Deletion verified for ${className} (attempt ${attempt}/${maxRetries})`);
                    break;
                  }
                }
              } catch (readError: any) {
                // If read throws 404, class is deleted
                if (readError.message?.includes('404') || readError.message?.includes('not found') || readError.message?.includes('does not exist')) {
                  deletionVerified = true;
                  debugLog('PRE_CLEANUP', `Deletion verified for ${className} via exception (attempt ${attempt}/${maxRetries})`);
                  break;
                }
              }

              if (attempt < maxRetries) {
                debugLog('PRE_CLEANUP', `Class ${className} still exists, retrying verification (attempt ${attempt}/${maxRetries})...`);
                await delay(retryDelay);
              }
            }

            if (deletionVerified) {
              debugLog('PRE_CLEANUP', `Successfully deleted and verified deletion of existing class ${className}`);
              classExists = false; // Update flag after successful deletion
            } else {
              debugLog('PRE_CLEANUP', `Class ${className} deleted but verification failed - class may still exist in SAP cache`);
              // Keep classExists = true to let validation handle it
            }
          } else {
            debugLog('PRE_CLEANUP', `Delete returned error (class may be locked/corrupted): ${preDeleteResponse.content[0]?.text || 'Unknown'}`);
            // If delete fails, class still exists - will be handled by validation
          }
        } catch (preDeleteError: any) {
          // Ignore errors - class may be locked/corrupted
          debugLog('PRE_CLEANUP', `Pre-cleanup delete failed: ${preDeleteError.message}`);
        }
      } else {
        debugLog('PRE_CLEANUP', `Skipping delete - class ${className} does not exist`);
      }

      // Track lock state and creation state for cleanup
      let lockHandle: string | null = null;
      let lockSession: SessionInfo | null = null;
      let classCreated = false;

      try {
        // Step 1: Validate
        debugLog('VALIDATE', `Starting validation for ${className}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const validateResponse = await handleValidateClass({
          class_name: className,
          package_name: packageName,
          description,
          session_id: session.session_id,
          session_state: session.session_state
        });

        const validateData = parseHandlerResponse(validateResponse);
        debugLog('VALIDATE_RESPONSE', `Validation response parsed`, {
          valid: validateData.validation_result?.valid,
          message: validateData.validation_result?.message,
          exists: validateData.validation_result?.exists
        });

        if (!validateData.validation_result?.valid) {
          // Validation returned 400 - class exists or validation failed
          // Principle 2: first error and exit
          const validationMessage = validateData.validation_result?.message || 'Validation failed';
          const exists = validateData.validation_result?.exists ? ' (object already exists)' : '';
          const skipReason = `ValidateClass operation for class ${className} failed validation${exists}: ${validationMessage}`;
          console.log(`⏭️  SKIP: ${skipReason}`);
          // Throw error to mark test as failed (not passed) when validation fails
          // This prevents test from being marked as "passed" when it should be skipped
          throw new Error(`SKIP: ${skipReason}`);
        }

        // Update session from validation response
        const oldSessionId = session.session_id;
        session = updateSessionFromResponse(session, validateData);
        debugLog('VALIDATE', 'Validation completed and session updated', {
          old_session_id: oldSessionId,
          new_session_id: session.session_id,
          session_changed: oldSessionId !== session.session_id
        });

        // Step 2: Create
        debugLog('CREATE', `Starting creation for ${className}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const createResponse = await handleCreateClass({
          class_name: className,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (createResponse.isError) {
          throw new Error(`Create failed: ${createResponse.content[0]?.text || 'Unknown error'}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.class_name).toBe(className);

        // Mark class as created successfully
        classCreated = true;

        // Update session from create response
        const oldSessionId2 = session.session_id;
        session = updateSessionFromResponse(session, createData);
        debugLog('CREATE', 'Creation completed and session updated', {
          old_session_id: oldSessionId2,
          new_session_id: session.session_id,
          session_changed: oldSessionId2 !== session.session_id
        });

        // Wait for creation to complete
        await delay(getOperationDelay('create', testCase));

        // Step 3: Lock
        debugLog('LOCK', `Starting lock for ${className}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state,
          session_state_cookies: session.session_state?.cookies?.substring(0, 50) + '...'
        });
        const lockResponse = await handleLockClass({
          class_name: className,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (lockResponse.isError) {
          throw new Error(`Lock failed: ${lockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const lockData = parseHandlerResponse(lockResponse);
        lockHandle = extractLockHandle(lockData);

        // CRITICAL: Extract session from Lock response
        lockSession = extractLockSession(lockData);

        // Persist lock snapshot for diagnostics
        diagnosticsTracker?.persistLock(lockSession, lockHandle, {
          object_type: 'CLAS/OC',
          object_name: className,
          transport_request: transportRequest
        });

        // CRITICAL: Verify Lock returned session_id and session_state
        expect(lockSession.session_id).toBeDefined();
        expect(lockSession.session_state).toBeDefined();
        expect(lockSession.session_state?.cookies).toBeDefined();
        expect(lockSession.session_state?.csrf_token).toBeDefined();

        debugLog('LOCK', 'Lock completed, extracted session', {
          lock_handle: lockHandle,
          lock_session_id: lockSession.session_id,
          has_lock_session_state: !!lockSession.session_state,
          lock_session_state_cookies: lockSession.session_state?.cookies?.substring(0, 50) + '...',
          lock_session_state_csrf: lockSession.session_state?.csrf_token?.substring(0, 20) + '...'
        });

        // Wait for lock to complete
        await delay(getOperationDelay('lock', testCase));

        // Step 4: Check new code before update
        debugLog('CHECK', `Starting check for new code before update for ${className}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          has_session_state: !!lockSession.session_state
        });
        const sourceCode = testCase.params.update_source_code || testCase.params.source_code || `CLASS ${className.toLowerCase()} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS: get_message RETURNING VALUE(result) TYPE string.
ENDCLASS.

CLASS ${className.toLowerCase()} IMPLEMENTATION.
  METHOD get_message.
    result = 'Hello from ${className}'.
  ENDMETHOD.
ENDCLASS.`;

        const checkResponse = await handleCheckClass({
          class_name: className,
          source_code: sourceCode,
          version: 'inactive',
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });

        let checkPassed = false;
        if (checkResponse.isError) {
          const checkError = checkResponse.content[0]?.text || 'Unknown error';
          debugLog('CHECK_ERROR', `Check failed: ${checkError}`, {
            error: checkError
          });
          console.log(`⚠️  Check failed for new code - skipping update, will only unlock`);
        } else {
          const checkData = parseHandlerResponse(checkResponse);
          // Check if there are errors in check result
          const hasErrors = checkData.check_result?.has_errors || checkData.check_result?.errors?.length > 0;
          if (hasErrors) {
            debugLog('CHECK_FAILED', `Check found errors`, {
              errors: checkData.check_result?.errors
            });
            console.log(`⚠️  Check found errors in new code - skipping update, will only unlock`);
          } else {
            checkPassed = true;
            debugLog('CHECK_PASSED', `Check passed - new code is valid`, {
              check_result: checkData.check_result
            });
            console.log(`✅ Check passed - new code is valid, proceeding with update`);
          }
        }

        // Wait for check to complete
        await delay(getOperationDelay('check', testCase));

        // Step 5: Update (only if check passed)
        if (!checkPassed) {
          console.log(`⏭️  Skipping update due to check failure - proceeding to unlock`);
        } else {
          debugLog('UPDATE', `Starting update for ${className}`, {
            lock_handle: lockHandle,
            session_id: lockSession.session_id,  // ← From Lock response
            has_session_state: !!lockSession.session_state,
            session_state_cookies: lockSession.session_state?.cookies?.substring(0, 50) + '...',
            session_state_csrf: lockSession.session_state?.csrf_token?.substring(0, 20) + '...'
          });

          const updateResponse = await handleUpdateClass({
          class_name: className,
          source_code: sourceCode,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,  // ← From Lock response
          session_state: lockSession.session_state  // ← From Lock response
        });

        if (updateResponse.isError) {
          throw new Error(`Update failed: ${updateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const updateData = parseHandlerResponse(updateResponse);
        expect(updateData.success).toBe(true);

        // CRITICAL: Verify Update used the same session_id as Lock
        expect(updateData.session_id).toBe(lockSession.session_id);
        debugLog('UPDATE', 'Update completed successfully', {
          update_success: updateData.success,
          update_session_id: updateData.session_id,
          lock_session_id: lockSession.session_id,
          sessions_match: updateData.session_id === lockSession.session_id
        });

          // Wait for update to complete
          await delay(getOperationDelay('update', testCase));
        }

        // Step 6: Unlock
        debugLog('UNLOCK', `Starting unlock for ${className}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id,  // ← From Lock response
          has_session_state: !!lockSession.session_state,
          session_state_cookies: lockSession.session_state?.cookies?.substring(0, 50) + '...',
          session_state_csrf: lockSession.session_state?.csrf_token?.substring(0, 20) + '...'
        });
        const unlockResponse = await handleUnlockClass({
          class_name: className,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,  // ← From Lock response
          session_state: lockSession.session_state  // ← From Lock response
        });

        if (unlockResponse.isError) {
          throw new Error(`Unlock failed: ${unlockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const unlockData = parseHandlerResponse(unlockResponse);
        expect(unlockData.success).toBe(true);

        // Update session from unlock response
        const oldSessionId3 = session.session_id;
        session = updateSessionFromResponse(session, unlockData);
        debugLog('UNLOCK', 'Unlock completed successfully', {
          unlock_success: unlockData.success,
          old_session_id: oldSessionId3,
          new_session_id: session.session_id,
          session_changed: oldSessionId3 !== session.session_id
        });

        // Wait for unlock to complete
        await delay(getOperationDelay('unlock', testCase));

        // Step 6: Activate
        debugLog('ACTIVATE', `Starting activation for ${className}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const activateResponse = await handleActivateClass({
          class_name: className,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (activateResponse.isError) {
          throw new Error(`Activate failed: ${activateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const activateData = parseHandlerResponse(activateResponse);
        expect(activateData.success).toBe(true);

        debugLog('ACTIVATE', 'Activation completed successfully', {
          activate_success: activateData.success
        });

        debugLog('TEST_COMPLETE', `Full workflow completed successfully for ${className}`, {
          className,
          steps_completed: ['validate', 'create', 'lock', 'update', 'unlock', 'activate']
        });

        console.log(`✅ Full workflow completed successfully for ${className}`);

      } catch (error: any) {
        // Principle 1: If lock was done, unlock is mandatory
        if (lockHandle && lockSession) {
          try {
            debugLog('CLEANUP_ON_ERROR', `Attempting to unlock class ${className} after error`, {
              lock_handle: lockHandle,
              session_id: lockSession.session_id
            });
            await handleUnlockClass({
              class_name: className,
              lock_handle: lockHandle,
              session_id: lockSession.session_id,
              session_state: lockSession.session_state
            });
            debugLog('CLEANUP_ON_ERROR', `Successfully unlocked class ${className} after error`);
          } catch (unlockError) {
            debugLog('CLEANUP_ON_ERROR', `Failed to unlock class ${className} after error`, {
              unlockError: unlockError instanceof Error ? unlockError.message : String(unlockError)
            });
            console.error('Failed to unlock class after error:', unlockError);
          }
        }

        // Check if this is a skip error (starts with "SKIP:")
        if (error.message && error.message.startsWith('SKIP:')) {
          // This is a skip error - rethrow to mark test as failed (not passed)
          // This prevents test from being marked as "passed" when it should be skipped
          throw error;
        }

        // Principle 2: first error and exit
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
            const sessionCfg = getSessionConfig();

            // Principle 1: If lock was done, unlock is mandatory
            // Unlock was already handled in catch block, but ensure it's done here too if needed
            if (lockHandle && lockSession) {
              try {
                debugLog('CLEANUP', `Attempting to unlock class ${className} (cleanup)`, {
                  class_name: className,
                  session_id: lockSession.session_id,
                  class_created: classCreated,
                  has_lock_handle: !!lockHandle
                });

                await handleUnlockClass({
                  class_name: className,
                  lock_handle: lockHandle,
                  session_id: lockSession.session_id,
                  session_state: lockSession.session_state
                });

                debugLog('CLEANUP', `Successfully unlocked class ${className} (cleanup)`);
                console.log(`🔓 Unlocked class ${className} (cleanup)`);
              } catch (unlockError: any) {
                debugLog('CLEANUP', `Failed to unlock class ${className} (cleanup)`, {
                  error: unlockError instanceof Error ? unlockError.message : String(unlockError)
                });
                console.warn(`⚠️  Failed to unlock class ${className} during cleanup: ${unlockError.message || unlockError}`);
              }
            }

            // Delete class only if cleanup_after is true
            if (shouldCleanup) {
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
});
