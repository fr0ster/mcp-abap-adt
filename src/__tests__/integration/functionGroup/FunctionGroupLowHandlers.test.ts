/**
 * Integration tests for FunctionGroup Low-Level Handlers
 *
 * Tests the complete workflow using handler functions directly:
 * GetSession → ValidateFunctionGroupLow → CreateFunctionGroupLow → LockFunctionGroupLow →
 * UnlockFunctionGroupLow → ActivateFunctionGroupLow → DeleteFunctionGroupLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/functionGroup
 */

import { handleValidateFunctionGroup } from '../../../handlers/function/low/handleValidateFunctionGroup';
import { handleCreateFunctionGroup } from '../../../handlers/function/low/handleCreateFunctionGroup';
import { handleLockFunctionGroup } from '../../../handlers/function/low/handleLockFunctionGroup';
import { handleUnlockFunctionGroup } from '../../../handlers/function/low/handleUnlockFunctionGroup';
import { handleActivateFunctionGroup } from '../../../handlers/function/low/handleActivateFunctionGroup';
import { handleDeleteFunctionGroup } from '../../../handlers/function/low/handleDeleteFunctionGroup';

import {
  parseHandlerResponse,
  extractLockHandle,
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

describe('FunctionGroup Low-Level Handlers Integration', () => {
  let session: SessionInfo | null = null;
  let hasConfig = false;

  beforeAll(async () => {
    try {
      session = await getTestSession();
      hasConfig = true;
    } catch (error) {
      console.warn('⚠️ Skipping tests: No .env file or SAP configuration found');
      hasConfig = false;
    }
  });

  describe('Full Workflow', () => {
    let testCase: any = null;
    let testFunctionGroupName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig || !session) {
        return;
      }

      testCase = getEnabledTestCase('create_function_group_low', 'full_workflow');
      if (!testCase) {
        return;
      }

      testFunctionGroupName = testCase.params.function_group_name;
    });

    it('should execute full workflow: Validate → Create → Lock → Unlock → Activate', async () => {
      if (!hasConfig || !session || !testCase || !testFunctionGroupName) {
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasSession: !!session,
          hasTestCase: !!testCase,
          hasTestFunctionGroupName: !!testFunctionGroupName
        });
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const functionGroupName = testFunctionGroupName;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test function group for low-level handler`;

      debugLog('TEST_START', `Starting full workflow test for function group: ${functionGroupName}`, {
        functionGroupName,
        packageName,
        transportRequest,
        description
      });

      let lockHandleForCleanup: string | null = null;
      let lockSessionForCleanup: SessionInfo | null = null;

      try {
        // Step 1: Validate
        debugLog('VALIDATE', `Starting validation for ${functionGroupName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        debugLog('HANDLER_CALL', `Calling handleValidateFunctionGroup`, {
          function_group_name: functionGroupName,
          description: description,
          has_session: !!(session.session_id && session.session_state)
        });
        const validateResponse = await handleValidateFunctionGroup({
          function_group_name: functionGroupName,
          description: description,
          session_id: session.session_id,
          session_state: session.session_state
        });
        debugLog('HANDLER_RESPONSE', `Received response from handleValidateFunctionGroup`, {
          isError: validateResponse.isError,
          hasContent: validateResponse.content && validateResponse.content.length > 0
        });

        if (validateResponse.isError) {
          const errorMsg = validateResponse.content[0]?.text || 'Unknown error';
          debugLog('VALIDATE_ERROR', `Validation returned error: ${errorMsg}`, {
            error: errorMsg,
            response: validateResponse
          });
          if (errorMsg.includes('already exists')) {
            console.log(`⏭️  FunctionGroup ${functionGroupName} already exists, skipping test`);
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
          const message = validateData.validation_result?.message || '';
          const messageLower = message.toLowerCase();
          if (validateData.validation_result?.exists ||
              messageLower.includes('already exists') ||
              messageLower.includes('does already exist')) {
            console.log(`⏭️  FunctionGroup ${functionGroupName} already exists, skipping test`);
            return;
          }
          console.warn(`⚠️  Validation failed for ${functionGroupName}: ${message}. Will attempt create and handle if object exists...`);
        }

        const oldSessionId = session.session_id;
        session = updateSessionFromResponse(session, validateData);
        debugLog('VALIDATE', 'Validation completed and session updated', {
          old_session_id: oldSessionId,
          new_session_id: session.session_id,
          session_changed: oldSessionId !== session.session_id
        });

        // Step 2: Create
        debugLog('CREATE', `Starting creation for ${functionGroupName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        debugLog('HANDLER_CALL', `Calling handleCreateFunctionGroup`, {
          function_group_name: functionGroupName,
          package_name: packageName,
          transport_request: transportRequest,
          has_session: !!(session.session_id && session.session_state)
        });
        const createResponse = await handleCreateFunctionGroup({
          function_group_name: functionGroupName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          session_id: session.session_id,
          session_state: session.session_state
        });
        debugLog('HANDLER_RESPONSE', `Received response from handleCreateFunctionGroup`, {
          isError: createResponse.isError,
          hasContent: createResponse.content && createResponse.content.length > 0
        });

        if (createResponse.isError) {
          const errorMsg = createResponse.content[0]?.text || 'Unknown error';
          debugLog('CREATE_ERROR', `Create returned error: ${errorMsg}`, {
            error: errorMsg,
            response: createResponse
          });
          if (errorMsg.includes('already exists') || errorMsg.includes('does already exist')) {
            console.log(`⏭️  FunctionGroup ${functionGroupName} already exists, skipping test`);
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.function_group_name).toBe(functionGroupName);

        const oldSessionId2 = session.session_id;
        session = updateSessionFromResponse(session, createData);
        debugLog('CREATE', 'Creation completed and session updated', {
          old_session_id: oldSessionId2,
          new_session_id: session.session_id,
          session_changed: oldSessionId2 !== session.session_id
        });
        await delay(getOperationDelay('create', testCase));

        // Step 3: Lock
        debugLog('LOCK', `Starting lock for ${functionGroupName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        debugLog('HANDLER_CALL', `Calling handleLockFunctionGroup`, {
          function_group_name: functionGroupName,
          has_session: !!(session.session_id && session.session_state)
        });
        const lockResponse = await handleLockFunctionGroup({
          function_group_name: functionGroupName,
          session_id: session.session_id,
          session_state: session.session_state
        });
        debugLog('HANDLER_RESPONSE', `Received response from handleLockFunctionGroup`, {
          isError: lockResponse.isError,
          hasContent: lockResponse.content && lockResponse.content.length > 0
        });

        if (lockResponse.isError) {
          debugLog('LOCK_ERROR', `Lock returned error: ${lockResponse.content[0]?.text || 'Unknown error'}`, {
            response: lockResponse
          });
          throw new Error(`Lock failed: ${lockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const lockData = parseHandlerResponse(lockResponse);
        const lockHandle = extractLockHandle(lockData);
        const lockSession = extractLockSession(lockData);

        expect(lockSession.session_id).toBeDefined();
        expect(lockSession.session_state).toBeDefined();

        lockHandleForCleanup = lockHandle;
        lockSessionForCleanup = lockSession;

        debugLog('LOCK', 'Lock completed, extracted session', {
          lock_handle: lockHandle,
          lock_session_id: lockSession.session_id,
          has_lock_session_state: !!lockSession.session_state
        });

        await delay(getOperationDelay('lock', testCase));

        // Step 4: Unlock (FunctionGroup doesn't have update step)
        debugLog('UNLOCK', `Starting unlock for ${functionGroupName}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          has_session_state: !!lockSession.session_state
        });
        debugLog('HANDLER_CALL', `Calling handleUnlockFunctionGroup`, {
          function_group_name: functionGroupName,
          lock_handle: lockHandle,
          has_session: !!(lockSession.session_id && lockSession.session_state)
        });
        const unlockResponse = await handleUnlockFunctionGroup({
          function_group_name: functionGroupName,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });
        debugLog('HANDLER_RESPONSE', `Received response from handleUnlockFunctionGroup`, {
          isError: unlockResponse.isError,
          hasContent: unlockResponse.content && unlockResponse.content.length > 0
        });

        if (unlockResponse.isError) {
          debugLog('UNLOCK_ERROR', `Unlock returned error: ${unlockResponse.content[0]?.text || 'Unknown error'}`, {
            response: unlockResponse
          });
          throw new Error(`Unlock failed: ${unlockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const unlockData = parseHandlerResponse(unlockResponse);
        expect(unlockData.success).toBe(true);
        expect(unlockData.session_id).toBe(lockSession.session_id);

        const oldSessionId3 = session.session_id;
        session = updateSessionFromResponse(session, unlockData);
        debugLog('UNLOCK', 'Unlock completed and session updated', {
          old_session_id: oldSessionId3,
          new_session_id: session.session_id,
          session_changed: oldSessionId3 !== session.session_id
        });
        await delay(getOperationDelay('unlock', testCase));

        // Step 5: Activate
        debugLog('ACTIVATE', `Starting activation for ${functionGroupName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        debugLog('HANDLER_CALL', `Calling handleActivateFunctionGroup`, {
          function_group_name: functionGroupName,
          has_session: !!(session.session_id && session.session_state)
        });
        const activateResponse = await handleActivateFunctionGroup({
          function_group_name: functionGroupName,
          session_id: session.session_id,
          session_state: session.session_state
        });
        debugLog('HANDLER_RESPONSE', `Received response from handleActivateFunctionGroup`, {
          isError: activateResponse.isError,
          hasContent: activateResponse.content && activateResponse.content.length > 0
        });

        if (activateResponse.isError) {
          debugLog('ACTIVATE_ERROR', `Activate returned error: ${activateResponse.content[0]?.text || 'Unknown error'}`, {
            response: activateResponse
          });
          throw new Error(`Activate failed: ${activateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const activateData = parseHandlerResponse(activateResponse);
        debugLog('ACTIVATE_RESPONSE', `Activation response parsed`, {
          success: activateData.success,
          activation: activateData.activation,
          messages: activateData.messages,
          warnings: activateData.warnings,
          errors: activateData.errors,
          fullResponse: activateData
        });

        // For FunctionGroup, activation may return generated: true but activated: false
        // if the FunctionGroup is empty (no Function Modules). This is expected behavior.
        // We consider it successful if:
        // 1. No errors in messages, OR
        // 2. generated: true (code was generated), OR
        // 3. activated: true && checked: true (full activation)
        const hasErrors = activateData.errors && activateData.errors.length > 0;
        const isGenerated = activateData.activation?.generated === true;
        const isFullyActivated = activateData.activation?.activated === true && activateData.activation?.checked === true;

        if (hasErrors) {
          throw new Error(`Activation failed with errors: ${JSON.stringify(activateData.errors)}`);
        }

        // Accept if generated or fully activated
        expect(isGenerated || isFullyActivated).toBe(true);

        debugLog('ACTIVATE_SUCCESS', `Activation accepted for FunctionGroup (generated: ${isGenerated}, fully activated: ${isFullyActivated})`, {
          generated: isGenerated,
          fullyActivated: isFullyActivated,
          hasErrors: hasErrors
        });

        debugLog('TEST_COMPLETE', `Full workflow completed successfully for ${functionGroupName}`, {
          functionGroupName,
          steps_completed: ['validate', 'create', 'lock', 'unlock', 'activate']
        });
        console.log(`✅ Full workflow completed successfully for ${functionGroupName}`);

      } catch (error: any) {
        debugLog('TEST_ERROR', `Test failed: ${error.message}`, {
          error: error.message,
          stack: error.stack,
          functionGroupName
        });
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup
        debugLog('CLEANUP', `Starting cleanup for ${functionGroupName}`, {
          functionGroupName,
          hasSession: !!session
        });
        if (session && functionGroupName) {
          try {
            if (lockHandleForCleanup && lockSessionForCleanup) {
              try {
                await handleUnlockFunctionGroup({
                  function_group_name: functionGroupName,
                  lock_handle: lockHandleForCleanup,
                  session_id: lockSessionForCleanup.session_id,
                  session_state: lockSessionForCleanup.session_state
                });
              } catch (unlockError: any) {
                console.warn(`⚠️  Failed to unlock with saved handle: ${unlockError.message}`);
              }
            }

            await delay(1000);

            const deleteResponse = await handleDeleteFunctionGroup({
              function_group_name: functionGroupName,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              debugLog('CLEANUP', `Successfully deleted test function group: ${functionGroupName}`);
              console.log(`🧹 Cleaned up test function group: ${functionGroupName}`);
            } else {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              debugLog('CLEANUP_ERROR', `Failed to delete function group ${functionGroupName}`, {
                error: errorMsg
              });
              console.warn(`⚠️  Failed to delete function group ${functionGroupName}: ${errorMsg}`);
            }
          } catch (cleanupError: any) {
            debugLog('CLEANUP_ERROR', `Failed to cleanup test function group ${functionGroupName}`, {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            });
            console.warn(`⚠️  Failed to cleanup test function group ${functionGroupName}: ${cleanupError.message || cleanupError}`);
          }
        }
      }
    }, getTimeout('long'));
  });
});
