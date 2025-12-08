/**
 * Integration tests for View Low-Level Handlers
 *
 * Tests the complete workflow using handler functions directly:
 * GetSession → ValidateViewLow → CreateViewLow → LockViewLow →
 * UpdateViewLow → UnlockViewLow → ActivateViewLow → DeleteViewLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/view
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleValidateView } from '../../../handlers/view/low/handleValidateView';
import { handleCreateView } from '../../../handlers/view/low/handleCreateView';
import { handleLockView } from '../../../handlers/view/low/handleLockView';
import { handleUpdateView } from '../../../handlers/view/low/handleUpdateView';
import { handleUnlockView } from '../../../handlers/view/low/handleUnlockView';
import { handleActivateView } from '../../../handlers/view/low/handleActivateView';
import { handleDeleteView } from '../../../handlers/view/low/handleDeleteView';

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
  getCleanupAfter
} from '../helpers/configHelpers';
import { createDiagnosticsTracker } from '../helpers/persistenceHelpers';

// Load environment variables
// loadTestEnv will be called in beforeAll

describe('View Low-Level Handlers Integration', () => {
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
    let testViewName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig || !session) {
        return;
      }

      // Get test case configuration
      testCase = getEnabledTestCase('create_view_low', 'full_workflow');
      if (!testCase) {
        return;
      }

      testViewName = testCase.params.view_name;
    });

    it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
      if (!hasConfig || !session || !testCase || !testViewName) {
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasSession: !!session,
          hasTestCase: !!testCase,
          hasTestViewName: !!testViewName
        });
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const viewName = testViewName;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test view for low-level handler`;
      const diagnosticsTracker = createDiagnosticsTracker('view_low_full_workflow', testCase, session, {
        handler: 'create_view_low',
        object_name: viewName
      });

      debugLog('TEST_START', `Starting full workflow test for view: ${viewName}`, {
        viewName,
        packageName,
        transportRequest,
        description
      });

      try {
        // Step 1: Validate
        debugLog('VALIDATE', `Starting validation for ${viewName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const validateResponse = await handleValidateView({
          view_name: viewName,
          description,
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
          // If view already exists, that's okay - we'll skip creation
          if (errorMsg.includes('already exists')) {
            console.log(`⏭️  View ${viewName} already exists, skipping test`);
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
          throw new Error(`Validation failed: ${validateData.validation_result?.message || 'Invalid view name'}`);
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
        const ddlSource = testCase.params.ddl_source || `@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: '${description}'
@Metadata.ignorePropagatedAnnotations: true
@Metadata.allowExtensions: true
define view entity ${viewName} as select from dummy {
  key dummy.dummy as dummy_field
}`;

        debugLog('CREATE', `Starting creation for ${viewName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const createResponse = await handleCreateView({
          view_name: viewName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (createResponse.isError) {
          debugLog('CREATE_ERROR', `Create returned error: ${createResponse.content[0]?.text || 'Unknown error'}`, {
            response: createResponse
          });
          throw new Error(`Create failed: ${createResponse.content[0]?.text || 'Unknown error'}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.view_name).toBe(viewName);

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
        debugLog('LOCK', `Starting lock for ${viewName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const lockResponse = await handleLockView({
          view_name: viewName,
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

        // CRITICAL: Extract session from Lock response
        const lockSession = extractLockSession(lockData);

        diagnosticsTracker.persistLock(lockSession, lockHandle, {
          object_type: 'VIEW',
          object_name: viewName,
          transport_request: transportRequest
        });

        debugLog('LOCK', 'Lock completed, extracted session', {
          lock_handle: lockHandle,
          lock_session_id: lockSession.session_id,
          has_lock_session_state: !!lockSession.session_state
        });

        // Wait for lock to complete
        await delay(getOperationDelay('lock', testCase));

        // Step 4: Update
        const updatedDdlSource = testCase.params.updated_ddl_source || `@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: '${description} (updated)'
@Metadata.ignorePropagatedAnnotations: true
@Metadata.allowExtensions: true
define view entity ${viewName} as select from dummy {
  key dummy.dummy as dummy_field,
  dummy.dummy as additional_field
}`;

        debugLog('UPDATE', `Starting update for ${viewName}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          has_session_state: !!lockSession.session_state,
          ddlSourceLength: updatedDdlSource.length
        });
        const updateResponse = await handleUpdateView({
          view_name: viewName,
          ddl_source: updatedDdlSource,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,  // ← From Lock response
          session_state: lockSession.session_state  // ← From Lock response
        });

        if (updateResponse.isError) {
          debugLog('UPDATE_ERROR', `Update returned error: ${updateResponse.content[0]?.text || 'Unknown error'}`, {
            response: updateResponse
          });
          throw new Error(`Update failed: ${updateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const updateData = parseHandlerResponse(updateResponse);
        expect(updateData.success).toBe(true);
        debugLog('UPDATE', 'Update completed successfully', {
          viewName,
          success: updateData.success
        });

        // Wait for update to complete
        await delay(getOperationDelay('update', testCase));

        // Step 5: Unlock
        debugLog('UNLOCK', `Starting unlock for ${viewName}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          has_session_state: !!lockSession.session_state
        });
        const unlockResponse = await handleUnlockView({
          view_name: viewName,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,  // ← From Lock response
          session_state: lockSession.session_state  // ← From Lock response
        });

        if (unlockResponse.isError) {
          debugLog('UNLOCK_ERROR', `Unlock returned error: ${unlockResponse.content[0]?.text || 'Unknown error'}`, {
            response: unlockResponse
          });
          throw new Error(`Unlock failed: ${unlockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const unlockData = parseHandlerResponse(unlockResponse);
        expect(unlockData.success).toBe(true);

        // Update session from unlock response
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
        debugLog('ACTIVATE', `Starting activation for ${viewName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const activateResponse = await handleActivateView({
          view_name: viewName,
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
          viewName,
          success: activateData.success
        });

        debugLog('TEST_COMPLETE', `Full workflow completed successfully for ${viewName}`, {
          viewName,
          steps_completed: ['validate', 'create', 'lock', 'update', 'unlock', 'activate']
        });
        console.log(`✅ Full workflow completed successfully for ${viewName}`);

      } catch (error: any) {
        debugLog('TEST_ERROR', `Test failed: ${error.message}`, {
          error: error.message,
          stack: error.stack,
          viewName
        });
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: Unlock and optionally delete test view
        debugLog('CLEANUP', `Starting cleanup for ${viewName}`, {
          viewName,
          hasSession: !!session
        });
        if (session && viewName) {
          try {
            const shouldCleanup = getCleanupAfter(testCase);

            // Always unlock (unlock is always performed)
            try {
              const lockResponse = await handleLockView({
                view_name: viewName,
                session_id: session.session_id,
                session_state: session.session_state
              });
              if (!lockResponse.isError) {
                const lockData = parseHandlerResponse(lockResponse);
                const lockHandle = extractLockHandle(lockData);
                const lockSession = extractLockSession(lockData);

                await handleUnlockView({
                  view_name: viewName,
                  lock_handle: lockHandle,
                  session_id: lockSession.session_id,
                  session_state: lockSession.session_state
                });
              }
            } catch (e) {
              // Ignore unlock errors during cleanup
            }

            // Delete view only if cleanup_after is true
            if (shouldCleanup) {
              const deleteResponse = await handleDeleteView({
                view_name: viewName,
                transport_request: transportRequest
              });

              if (!deleteResponse.isError) {
                debugLog('CLEANUP', `Successfully deleted test view: ${viewName}`);
                console.log(`🧹 Cleaned up test view: ${viewName}`);
              } else {
                debugLog('CLEANUP', `Failed to delete test view: ${viewName}`, {
                  error: deleteResponse.content[0]?.text || 'Unknown error'
                });
              }
            } else {
              debugLog('CLEANUP', `Cleanup skipped (cleanup_after=false) - object left for analysis: ${viewName}`);
              console.log(`⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${viewName}`);
            }
          } catch (cleanupError) {
            debugLog('CLEANUP_ERROR', `Failed to cleanup test view ${viewName}`, {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            });
            console.warn(`⚠️  Failed to cleanup test view ${viewName}: ${cleanupError}`);
          }
        }
        diagnosticsTracker.cleanup();
      }
    }, getTimeout('long'));
  });
});
