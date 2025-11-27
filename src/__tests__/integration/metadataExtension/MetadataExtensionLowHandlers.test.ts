/**
 * Integration tests for MetadataExtension Low-Level Handlers
 *
 * Tests the complete workflow using handler functions directly:
 * GetSession → ValidateMetadataExtensionLow → CreateMetadataExtensionLow → LockMetadataExtensionLow →
 * UpdateMetadataExtensionLow → UnlockMetadataExtensionLow → ActivateMetadataExtensionLow → DeleteMetadataExtensionLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/metadataExtension
 */

import { handleValidateMetadataExtension } from '../../../handlers/ddlx/low/handleValidateMetadataExtension';
import { handleCreateMetadataExtension } from '../../../handlers/ddlx/low/handleCreateMetadataExtension';
import { handleLockMetadataExtension } from '../../../handlers/ddlx/low/handleLockMetadataExtension';
import { handleUpdateMetadataExtension } from '../../../handlers/ddlx/low/handleUpdateMetadataExtension';
import { handleUnlockMetadataExtension } from '../../../handlers/ddlx/low/handleUnlockMetadataExtension';
import { handleActivateMetadataExtension } from '../../../handlers/ddlx/low/handleActivateMetadataExtension';
import { handleDeleteMetadataExtension } from '../../../handlers/ddlx/low/handleDeleteMetadataExtension';

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

describe('MetadataExtension Low-Level Handlers Integration', () => {
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
    let testDdlxName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig || !session) {
        return;
      }

      testCase = getEnabledTestCase('create_metadata_extension_low', 'full_workflow');
      if (!testCase) {
        return;
      }

      testDdlxName = testCase.params.name;
    });

    it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
      if (!hasConfig || !session || !testCase || !testDdlxName) {
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasSession: !!session,
          hasTestCase: !!testCase,
          hasTestDdlxName: !!testDdlxName
        });
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const ddlxName = testDdlxName;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test metadata extension for low-level handler`;

      debugLog('TEST_START', `Starting full workflow test for metadata extension: ${ddlxName}`, {
        ddlxName,
        packageName,
        transportRequest,
        description
      });

      let lockHandleForCleanup: string | null = null;
      let lockSessionForCleanup: SessionInfo | null = null;

      try {
        // Step 1: Validate
        debugLog('VALIDATE', `Starting validation for ${ddlxName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const validateResponse = await handleValidateMetadataExtension({
          name: ddlxName,
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
            console.log(`⏭️  MetadataExtension ${ddlxName} already exists, skipping test`);
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
            console.log(`⏭️  MetadataExtension ${ddlxName} already exists, skipping test`);
            return;
          }
          console.warn(`⚠️  Validation failed for ${ddlxName}: ${message}. Will attempt create and handle if object exists...`);
        }

        const oldSessionId = session.session_id;
        session = updateSessionFromResponse(session, validateData);
        debugLog('VALIDATE', 'Validation completed and session updated', {
          old_session_id: oldSessionId,
          new_session_id: session.session_id,
          session_changed: oldSessionId !== session.session_id
        });

        // Step 2: Create
        debugLog('CREATE', `Starting creation for ${ddlxName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const createResponse = await handleCreateMetadataExtension({
          name: ddlxName,
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
            console.log(`⏭️  MetadataExtension ${ddlxName} already exists, skipping test`);
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.name).toBe(ddlxName);

        const oldSessionId2 = session.session_id;
        session = updateSessionFromResponse(session, createData);
        debugLog('CREATE', 'Creation completed and session updated', {
          old_session_id: oldSessionId2,
          new_session_id: session.session_id,
          session_changed: oldSessionId2 !== session.session_id
        });
        await delay(getOperationDelay('create', testCase));

        // Step 3: Lock
        debugLog('LOCK', `Starting lock for ${ddlxName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const lockResponse = await handleLockMetadataExtension({
          name: ddlxName,
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
        const sourceCode = testCase.params.source_code || `@Metadata.layer: #CORE
annotate view ${testCase.params.view_name || 'ZI_VIEW'} with {
  @EndUserText.label: '${description}'
}`;

        debugLog('UPDATE', `Starting update for ${ddlxName}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          has_session_state: !!lockSession.session_state,
          sourceCodeLength: sourceCode.length
        });
        const updateResponse = await handleUpdateMetadataExtension({
          name: ddlxName,
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
          ddlxName,
          success: updateData.success
        });

        await delay(getOperationDelay('update', testCase));

        // Step 5: Unlock
        debugLog('UNLOCK', `Starting unlock for ${ddlxName}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          has_session_state: !!lockSession.session_state
        });
        const unlockResponse = await handleUnlockMetadataExtension({
          name: ddlxName,
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
        debugLog('ACTIVATE', `Starting activation for ${ddlxName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const activateResponse = await handleActivateMetadataExtension({
          name: ddlxName,
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
          ddlxName,
          success: activateData.success
        });

        debugLog('TEST_COMPLETE', `Full workflow completed successfully for ${ddlxName}`, {
          ddlxName,
          steps_completed: ['validate', 'create', 'lock', 'update', 'unlock', 'activate']
        });
        console.log(`✅ Full workflow completed successfully for ${ddlxName}`);

      } catch (error: any) {
        debugLog('TEST_ERROR', `Test failed: ${error.message}`, {
          error: error.message,
          stack: error.stack,
          ddlxName
        });
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup
        debugLog('CLEANUP', `Starting cleanup for ${ddlxName}`, {
          ddlxName,
          hasSession: !!session
        });
        if (session && ddlxName) {
          try {
            if (lockHandleForCleanup && lockSessionForCleanup) {
              try {
                await handleUnlockMetadataExtension({
                  name: ddlxName,
                  lock_handle: lockHandleForCleanup,
                  session_id: lockSessionForCleanup.session_id,
                  session_state: lockSessionForCleanup.session_state
                });
              } catch (unlockError: any) {
                console.warn(`⚠️  Failed to unlock with saved handle: ${unlockError.message}`);
              }
            }

            await delay(1000);

            const deleteResponse = await handleDeleteMetadataExtension({
              name: ddlxName,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              debugLog('CLEANUP', `Successfully deleted test metadata extension: ${ddlxName}`);
              console.log(`🧹 Cleaned up test metadata extension: ${ddlxName}`);
            } else {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              debugLog('CLEANUP_ERROR', `Failed to delete metadata extension ${ddlxName}`, {
                error: errorMsg
              });
              console.warn(`⚠️  Failed to delete metadata extension ${ddlxName}: ${errorMsg}`);
            }
          } catch (cleanupError: any) {
            debugLog('CLEANUP_ERROR', `Failed to cleanup test metadata extension ${ddlxName}`, {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            });
            console.warn(`⚠️  Failed to cleanup test metadata extension ${ddlxName}: ${cleanupError.message || cleanupError}`);
          }
        }
      }
    }, getTimeout('long'));
  });
});
