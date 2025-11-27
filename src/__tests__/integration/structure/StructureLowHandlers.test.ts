/**
 * Integration tests for Structure Low-Level Handlers
 *
 * Tests the complete workflow using handler functions directly:
 * GetSession → ValidateStructureLow → CreateStructureLow → LockStructureLow →
 * UpdateStructureLow → UnlockStructureLow → ActivateStructureLow → DeleteStructureLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/structure
 */

import { handleValidateStructure } from '../../../handlers/structure/low/handleValidateStructure';
import { handleCreateStructure } from '../../../handlers/structure/low/handleCreateStructure';
import { handleLockStructure } from '../../../handlers/structure/low/handleLockStructure';
import { handleUpdateStructure } from '../../../handlers/structure/low/handleUpdateStructure';
import { handleUnlockStructure } from '../../../handlers/structure/low/handleUnlockStructure';
import { handleActivateStructure } from '../../../handlers/structure/low/handleActivateStructure';
import { handleDeleteStructure } from '../../../handlers/structure/low/handleDeleteStructure';

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

describe('Structure Low-Level Handlers Integration', () => {
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
    let testStructureName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig || !session) {
        return;
      }

      testCase = getEnabledTestCase('create_structure_low', 'full_workflow');
      if (!testCase) {
        return;
      }

      testStructureName = testCase.params.structure_name;
    });

    it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
      if (!hasConfig || !session || !testCase || !testStructureName) {
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasSession: !!session,
          hasTestCase: !!testCase,
          hasTestStructureName: !!testStructureName
        });
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const structureName = testStructureName;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test structure for low-level handler`;

      debugLog('TEST_START', `Starting full workflow test for structure: ${structureName}`, {
        structureName,
        packageName,
        transportRequest,
        description
      });

      let lockHandleForCleanup: string | null = null;
      let lockSessionForCleanup: SessionInfo | null = null;

      try {
        // Step 1: Validate
        debugLog('VALIDATE', `Starting validation for ${structureName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const validateResponse = await handleValidateStructure({
          structure_name: structureName,
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
          if (errorMsg.includes('already exists')) {
            console.log(`⏭️  Structure ${structureName} already exists, skipping test`);
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
            console.log(`⏭️  Structure ${structureName} already exists, skipping test`);
            return;
          }
          console.warn(`⚠️  Validation failed for ${structureName}: ${message}. Will attempt create and handle if object exists...`);
        }

        const oldSessionId = session.session_id;
        session = updateSessionFromResponse(session, validateData);
        debugLog('VALIDATE', 'Validation completed and session updated', {
          old_session_id: oldSessionId,
          new_session_id: session.session_id,
          session_changed: oldSessionId !== session.session_id
        });

        // Step 2: Create
        debugLog('CREATE', `Starting creation for ${structureName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const createResponse = await handleCreateStructure({
          structure_name: structureName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (createResponse.isError) {
          const errorMsg = createResponse.content[0]?.text || 'Unknown error';
          debugLog('CREATE_ERROR', `Create returned error: ${errorMsg}`, {
            error: errorMsg,
            response: createResponse
          });
          if (errorMsg.includes('already exists') || errorMsg.includes('does already exist')) {
            console.log(`⏭️  Structure ${structureName} already exists, skipping test`);
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.structure_name).toBe(structureName);

        const oldSessionId2 = session.session_id;
        session = updateSessionFromResponse(session, createData);
        debugLog('CREATE', 'Creation completed and session updated', {
          old_session_id: oldSessionId2,
          new_session_id: session.session_id,
          session_changed: oldSessionId2 !== session.session_id
        });
        await delay(getOperationDelay('create', testCase));

        // Step 3: Lock
        debugLog('LOCK', `Starting lock for ${structureName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const lockResponse = await handleLockStructure({
          structure_name: structureName,
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

        lockHandleForCleanup = lockHandle;
        lockSessionForCleanup = lockSession;

        debugLog('LOCK', 'Lock completed, extracted session', {
          lock_handle: lockHandle,
          lock_session_id: lockSession.session_id,
          has_lock_session_state: !!lockSession.session_state
        });

        await delay(getOperationDelay('lock', testCase));

        // Step 4: Update
        const ddlCode = testCase.params.ddl_code || `@EndUserText.label: '${description}'
define type ${structureName} {
  field1 : abap.char(10);
  field2 : abap.char(20);
}`;
        const updatedDdlCode = testCase.params.updated_ddl_code || ddlCode;

        debugLog('UPDATE', `Starting update for ${structureName}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          has_session_state: !!lockSession.session_state,
          ddlCodeLength: updatedDdlCode.length
        });
        const updateResponse = await handleUpdateStructure({
          structure_name: structureName,
          ddl_code: updatedDdlCode,
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
          structureName,
          success: updateData.success
        });

        await delay(getOperationDelay('update', testCase));

        // Step 5: Unlock
        debugLog('UNLOCK', `Starting unlock for ${structureName}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          has_session_state: !!lockSession.session_state
        });
        const unlockResponse = await handleUnlockStructure({
          structure_name: structureName,
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
        await delay(getOperationDelay('unlock', testCase));

        // Step 6: Activate
        debugLog('ACTIVATE', `Starting activation for ${structureName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const activateResponse = await handleActivateStructure({
          structure_name: structureName,
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
          structureName,
          success: activateData.success
        });

        debugLog('TEST_COMPLETE', `Full workflow completed successfully for ${structureName}`, {
          structureName,
          steps_completed: ['validate', 'create', 'lock', 'update', 'unlock', 'activate']
        });
        console.log(`✅ Full workflow completed successfully for ${structureName}`);

      } catch (error: any) {
        debugLog('TEST_ERROR', `Test failed: ${error.message}`, {
          error: error.message,
          stack: error.stack,
          structureName
        });
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup
        debugLog('CLEANUP', `Starting cleanup for ${structureName}`, {
          structureName,
          hasSession: !!session
        });
        if (session && structureName) {
          try {
            if (lockHandleForCleanup && lockSessionForCleanup) {
              try {
                await handleUnlockStructure({
                  structure_name: structureName,
                  lock_handle: lockHandleForCleanup,
                  session_id: lockSessionForCleanup.session_id,
                  session_state: lockSessionForCleanup.session_state
                });
              } catch (unlockError: any) {
                console.warn(`⚠️  Failed to unlock with saved handle: ${unlockError.message}`);
              }
            }

            await delay(1000);

            const deleteResponse = await handleDeleteStructure({
              structure_name: structureName,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              debugLog('CLEANUP', `Successfully deleted test structure: ${structureName}`);
              console.log(`🧹 Cleaned up test structure: ${structureName}`);
            } else {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              debugLog('CLEANUP_ERROR', `Failed to delete structure ${structureName}`, {
                error: errorMsg
              });
              console.warn(`⚠️  Failed to delete structure ${structureName}: ${errorMsg}`);
            }
          } catch (cleanupError: any) {
            debugLog('CLEANUP_ERROR', `Failed to cleanup test structure ${structureName}`, {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            });
            console.warn(`⚠️  Failed to cleanup test structure ${structureName}: ${cleanupError.message || cleanupError}`);
          }
        }
      }
    }, getTimeout('long'));
  });
});
