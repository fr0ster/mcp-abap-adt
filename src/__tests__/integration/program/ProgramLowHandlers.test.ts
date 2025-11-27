/**
 * Integration tests for Program Low-Level Handlers
 *
 * Tests the complete workflow using handler functions directly:
 * GetSession → ValidateProgramLow → CreateProgramLow → LockProgramLow →
 * UpdateProgramLow → UnlockProgramLow → ActivateProgramLow → DeleteProgramLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/program
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleValidateProgram } from '../../../handlers/program/low/handleValidateProgram';
import { handleCreateProgram } from '../../../handlers/program/low/handleCreateProgram';
import { handleLockProgram } from '../../../handlers/program/low/handleLockProgram';
import { handleUpdateProgram } from '../../../handlers/program/low/handleUpdateProgram';
import { handleUnlockProgram } from '../../../handlers/program/low/handleUnlockProgram';
import { handleActivateProgram } from '../../../handlers/program/low/handleActivateProgram';
import { handleDeleteProgram } from '../../../handlers/program/low/handleDeleteProgram';

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
  loadTestEnv,
  isCloudConnection
} from '../helpers/configHelpers';

// Load environment variables
loadTestEnv();

describe('Program Low-Level Handlers Integration', () => {
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
    let testProgramName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig || !session) {
        return;
      }

      // Get test case configuration
      testCase = getEnabledTestCase('create_program_low', 'full_workflow');
      if (!testCase) {
        return;
      }

      testProgramName = testCase.params.program_name;
    });

    it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
      // Skip test on cloud - programs are not available on cloud systems
      if (isCloudConnection()) {
        console.log('⏭️  Skipping test: Programs are not available on cloud systems');
        return;
      }

      if (!hasConfig || !session || !testCase || !testProgramName) {
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasSession: !!session,
          hasTestCase: !!testCase,
          hasTestProgramName: !!testProgramName
        });
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const programName = testProgramName;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test program for low-level handler`;

      debugLog('TEST_START', `Starting full workflow test for program: ${programName}`, {
        programName,
        packageName,
        transportRequest,
        description
      });

      // Variables for cleanup (in case test fails)
      let lockHandleForCleanup: string | null = null;
      let lockSessionForCleanup: SessionInfo | null = null;

      try {
        // Step 1: Validate
        debugLog('VALIDATE', `Starting validation for ${programName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const validateResponse = await handleValidateProgram({
          program_name: programName,
          description: description,
          package_name: packageName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (validateResponse.isError) {
          const errorMsg = validateResponse.content[0]?.text || 'Unknown error';
          debugLog('VALIDATE_ERROR', `Validation returned error: ${errorMsg}`, {
            error: errorMsg,
            response: validateResponse
          });
          // If program already exists, that's okay - we'll skip creation
          if (errorMsg.includes('already exists')) {
            console.log(`⏭️  Program ${programName} already exists, skipping test`);
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
            console.log(`⏭️  Program ${programName} already exists, skipping test`);
            return;
          }
          console.warn(`⚠️  Validation failed for ${programName}: ${message}. Will attempt create and handle if object exists...`);
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
        debugLog('CREATE', `Starting creation for ${programName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const createResponse = await handleCreateProgram({
          program_name: programName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          program_type: testCase.params.program_type || '1',
          application: testCase.params.application,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (createResponse.isError) {
          const errorMsg = createResponse.content[0]?.text || 'Unknown error';
          debugLog('CREATE_ERROR', `Create returned error: ${errorMsg}`, {
            error: errorMsg,
            response: createResponse
          });
          // If program already exists, that's okay - we'll skip the rest of the test
          if (errorMsg.includes('already exists') || errorMsg.includes('does already exist')) {
            console.log(`⏭️  Program ${programName} already exists, skipping test`);
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.program_name).toBe(programName);

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
        debugLog('LOCK', `Starting lock for ${programName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const lockResponse = await handleLockProgram({
          program_name: programName,
          session_id: session.session_id,
          session_state: session.session_state
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
        expect(lockSession.session_state?.cookies).toBeDefined();
        expect(lockSession.session_state?.csrf_token).toBeDefined();

        // Save for cleanup
        lockHandleForCleanup = lockHandle;
        lockSessionForCleanup = lockSession;

        debugLog('LOCK', 'Lock completed, extracted session', {
          lock_handle: lockHandle,
          lock_session_id: lockSession.session_id,
          has_lock_session_state: !!lockSession.session_state
        });

        // Wait for lock to complete
        await delay(getOperationDelay('lock', testCase));

        // Step 4: Update
        const sourceCode = testCase.params.source_code || `* Test program\nWRITE: / 'Hello World'.`;

        debugLog('UPDATE', `Starting update for ${programName}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id
        });

        const updateResponse = await handleUpdateProgram({
          program_name: programName,
          source_code: sourceCode,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });

        if (updateResponse.isError) {
          debugLog('UPDATE_ERROR', `Update returned error: ${updateResponse.content[0]?.text || 'Unknown error'}`, {
            response: updateResponse
          });
          throw new Error(`Update failed: ${updateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const updateData = parseHandlerResponse(updateResponse);
        expect(updateData.success).toBe(true);
        expect(updateData.session_id).toBe(lockSession.session_id);
        debugLog('UPDATE', 'Update completed successfully', {
          programName,
          success: updateData.success
        });

        // Wait for update to complete
        await delay(getOperationDelay('update', testCase));

        // Step 5: Unlock
        debugLog('UNLOCK', `Starting unlock for ${programName}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id
        });

        const unlockResponse = await handleUnlockProgram({
          program_name: programName,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
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

        // Wait for unlock to complete
        await delay(getOperationDelay('unlock', testCase));

        // Step 6: Activate
        debugLog('ACTIVATE', `Starting activation for ${programName}`, {
          session_id: session.session_id
        });
        const activateResponse = await handleActivateProgram({
          program_name: programName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (activateResponse.isError) {
          debugLog('ACTIVATE_ERROR', `Activate returned error: ${activateResponse.content[0]?.text || 'Unknown error'}`, {
            response: activateResponse
          });
          throw new Error(`Activate failed: ${activateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const activateData = parseHandlerResponse(activateResponse);
        expect(activateData.success).toBe(true);
        debugLog('ACTIVATE', 'Activation completed successfully', {
          programName,
          success: activateData.success
        });

        debugLog('TEST_COMPLETE', `Full workflow completed successfully for ${programName}`, {
          programName,
          steps_completed: ['validate', 'create', 'lock', 'update', 'unlock', 'activate']
        });
        console.log(`✅ Full workflow completed successfully for ${programName}`);

      } catch (error: any) {
        debugLog('TEST_ERROR', `Test failed: ${error.message}`, {
          error: error.message,
          stack: error.stack,
          programName
        });
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: Unlock and delete test program
        debugLog('CLEANUP', `Starting cleanup for ${programName}`, {
          programName,
          hasSession: !!session
        });
        if (session && programName) {
          try {
            // Try to unlock first if we have lock handle
            if (lockHandleForCleanup && lockSessionForCleanup) {
              try {
                await handleUnlockProgram({
                  program_name: programName,
                  lock_handle: lockHandleForCleanup,
                  session_id: lockSessionForCleanup.session_id,
                  session_state: lockSessionForCleanup.session_state
                });
              } catch (unlockError: any) {
                console.warn(`⚠️  Failed to unlock with saved handle, trying to get new lock: ${unlockError.message}`);
                try {
                  const lockResponse = await handleLockProgram({
                    program_name: programName,
                    session_id: session.session_id,
                    session_state: session.session_state
                  });
                  if (!lockResponse.isError) {
                    const lockData = parseHandlerResponse(lockResponse);
                    const cleanupLockHandle = extractLockHandle(lockData);
                    const cleanupLockSession = extractLockSession(lockData);

                    await handleUnlockProgram({
                      program_name: programName,
                      lock_handle: cleanupLockHandle,
                      session_id: cleanupLockSession.session_id,
                      session_state: cleanupLockSession.session_state
                    });
                  }
                } catch (e) {
                  console.warn(`⚠️  Failed to unlock program ${programName} during cleanup: ${e}`);
                }
              }
            }

            // Wait a bit before deletion
            await delay(1000);

            // Delete program
            const deleteResponse = await handleDeleteProgram({
              program_name: programName,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              debugLog('CLEANUP', `Successfully deleted test program: ${programName}`);
              console.log(`🧹 Cleaned up test program: ${programName}`);
            } else {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              debugLog('CLEANUP_ERROR', `Failed to delete program ${programName}`, {
                error: errorMsg
              });
              console.warn(`⚠️  Failed to delete program ${programName}: ${errorMsg}`);
            }
          } catch (cleanupError: any) {
            debugLog('CLEANUP_ERROR', `Failed to cleanup test program ${programName}`, {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            });
            console.warn(`⚠️  Failed to cleanup test program ${programName}: ${cleanupError.message || cleanupError}`);
          }
        }
      }
    }, getTimeout('long'));
  });
});

