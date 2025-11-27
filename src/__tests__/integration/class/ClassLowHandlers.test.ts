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
import { handleUpdateClass } from '../../../handlers/class/low/handleUpdateClass';
import { handleUnlockClass } from '../../../handlers/class/low/handleUnlockClass';
import { handleActivateClass } from '../../../handlers/class/low/handleActivateClass';
import { handleDeleteClass } from '../../../handlers/class/low/handleDeleteClass';

import {
  parseHandlerResponse,
  extractSessionState,
  extractLockHandle,
  isSuccessResponse,
  delay,
  debugLog
} from '../helpers/testHelpers';
import {
  getTestSession,
  updateSessionFromResponse,
  extractLockSession,
  SessionInfo
} from '../helpers/sessionHelpers';
import {
  getEnabledTestCase,
  getTimeout,
  getOperationDelay,
  resolvePackageName,
  resolveTransportRequest,
  loadTestEnv
} from '../helpers/configHelpers';

// Load environment variables
loadTestEnv();

describe('Class Low-Level Handlers Integration', () => {
  let session: SessionInfo | null = null;
  let hasConfig = false;

  beforeAll(async () => {
    try {
      // Get initial session
      session = await getTestSession();
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
      if (!hasConfig || !session) {
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
      if (!hasConfig || !session || !testCase || !testClassName) {
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasSession: !!session,
          hasTestCase: !!testCase,
          hasTestClassName: !!testClassName
        });
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const className = testClassName;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test class for low-level handler`;

      debugLog('TEST_START', `Starting full workflow test for class: ${className}`, {
        className,
        packageName,
        transportRequest,
        description
      });

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

        if (validateResponse.isError) {
          const errorMsg = validateResponse.content[0]?.text || 'Unknown error';
          debugLog('VALIDATE_ERROR', `Validation returned error: ${errorMsg}`, {
            error: errorMsg,
            response: validateResponse
          });
          // If class already exists, that's okay - we'll skip creation
          if (errorMsg.includes('already exists') || errorMsg.includes('does already exist')) {
            console.log(`⏭️  Class ${className} already exists, skipping test`);
            return;
          }
          throw new Error(`Validation failed: ${errorMsg}`);
        }

        const validateData = parseHandlerResponse(validateResponse);
        debugLog('VALIDATE_RESPONSE', `Validation response parsed`, {
          valid: validateData.validation_result?.valid,
          message: validateData.validation_result?.message,
          exists: validateData.validation_result?.exists
        });

        if (!validateData.validation_result?.valid) {
          const message = validateData.validation_result?.message || 'Invalid class name';
          const messageLower = message.toLowerCase();
          // If validation says class exists, that's okay - we'll skip creation
          if (validateData.validation_result?.exists ||
              messageLower.includes('already exists') ||
              messageLower.includes('does already exist')) {
            console.log(`⏭️  Class ${className} already exists, skipping test`);
            return;
          }
          throw new Error(`Validation failed: ${message}`);
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
        const lockHandle = extractLockHandle(lockData);

        // CRITICAL: Extract session from Lock response
        const lockSession = extractLockSession(lockData);

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

        // Step 4: Update
        debugLog('UPDATE', `Starting update for ${className}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id,  // ← From Lock response
          has_session_state: !!lockSession.session_state,
          session_state_cookies: lockSession.session_state?.cookies?.substring(0, 50) + '...',
          session_state_csrf: lockSession.session_state?.csrf_token?.substring(0, 20) + '...'
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

        // Step 5: Unlock
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
        debugLog('TEST_ERROR', `Test failed: ${error.message}`, {
          error: error.message,
          stack: error.stack?.substring(0, 500) // Limit stack trace length
        });
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: Delete test class
        if (session && className) {
          try {
            debugLog('CLEANUP', `Starting cleanup: deleting test class ${className}`, {
              class_name: className,
              session_id: session.session_id
            });

            // Try to unlock first if still locked
            try {
              debugLog('CLEANUP', `Attempting to unlock class ${className} before deletion`);
              const lockResponse = await handleLockClass({
                class_name: className,
                session_id: session.session_id,
                session_state: session.session_state
              });
              if (!lockResponse.isError) {
                const lockData = parseHandlerResponse(lockResponse);
                const lockHandle = extractLockHandle(lockData);
                const lockSession = extractLockSession(lockData);

                await handleUnlockClass({
                  class_name: className,
                  lock_handle: lockHandle,
                  session_id: lockSession.session_id,
                  session_state: lockSession.session_state
                });
                debugLog('CLEANUP', `Successfully unlocked class ${className} before deletion`);
              }
            } catch (e) {
              debugLog('CLEANUP', `Could not unlock class ${className} (may not be locked)`, {
                error: e instanceof Error ? e.message : String(e)
              });
              // Ignore unlock errors during cleanup
            }

            // Delete class
            const deleteResponse = await handleDeleteClass({
              class_name: className,
              session_id: session.session_id,
              session_state: session.session_state
            });

            if (!deleteResponse.isError) {
              debugLog('CLEANUP', `Successfully deleted test class: ${className}`);
              console.log(`🧹 Cleaned up test class: ${className}`);
            } else {
              debugLog('CLEANUP', `Failed to delete test class: ${className}`, {
                error: deleteResponse.content[0]?.text || 'Unknown error'
              });
            }
          } catch (cleanupError) {
            debugLog('CLEANUP_ERROR', `Exception during cleanup: ${cleanupError}`, {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            });
            console.warn(`⚠️  Failed to cleanup test class ${className}: ${cleanupError}`);
          }
        }
      }
    }, getTimeout('long'));
  });
});

