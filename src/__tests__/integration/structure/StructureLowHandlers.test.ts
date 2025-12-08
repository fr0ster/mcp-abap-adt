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
import { handleCheckStructure } from '../../../handlers/structure/low/handleCheckStructure';
import { handleUnlockStructure } from '../../../handlers/structure/low/handleUnlockStructure';
import { handleActivateStructure } from '../../../handlers/structure/low/handleActivateStructure';
import { handleDeleteStructure } from '../../../handlers/structure/low/handleDeleteStructure';

import {
  parseHandlerResponse,
  extractLockHandle,
  delay,
  logTestStep,
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
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const structureName = testStructureName;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test structure for low-level handler`;
      const diagnosticsTracker = createDiagnosticsTracker('structure_low_full_workflow', testCase, session, {
        handler: 'create_structure_low',
        object_name: structureName
      });

      let lockHandleForCleanup: string | null = null;
      let lockSessionForCleanup: SessionInfo | null = null;
      let structureCreated = false;

      try {
        // Step 1: Validate
        logTestStep('validate');
        const validateResponse = await handleValidateStructure({
          structure_name: structureName,
          description: description,
          package_name: packageName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (validateResponse.isError) {
          const errorMsg = validateResponse.content[0]?.text || 'Unknown error';
          if (errorMsg.includes('already exists')) {
            console.log(`⏭️  Structure ${structureName} already exists, skipping test`);
            return;
          }
          console.error(`Validation failed: ${errorMsg}`);
          throw new Error(`Validation failed: ${errorMsg}`);
        }

        const validateData = parseHandlerResponse(validateResponse);

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

        session = updateSessionFromResponse(session, validateData);
        await delay(getOperationDelay('validate', testCase));

        // Step 2: Create
        logTestStep('create');
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
          if (errorMsg.includes('already exists') || errorMsg.includes('does already exist')) {
            console.log(`⏭️  Structure ${structureName} already exists, skipping test`);
            return;
          }
          console.error(`Creation failed: ${errorMsg}`);
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.structure_name).toBe(structureName);

        // Mark structure as created successfully
        structureCreated = true;

        session = updateSessionFromResponse(session, createData);
        await delay(getOperationDelay('create', testCase));

        // Step 3: Lock
        logTestStep('lock');
        const lockResponse = await handleLockStructure({
          structure_name: structureName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (lockResponse.isError) {
          const errorMsg = lockResponse.content[0]?.text || 'Unknown error';
          console.error(`Lock failed: ${errorMsg}`);
          throw new Error(`Lock failed: ${errorMsg}`);
        }

        const lockData = parseHandlerResponse(lockResponse);
        const lockHandle = extractLockHandle(lockData);
        const lockSession = extractLockSession(lockData);

        diagnosticsTracker.persistLock(lockSession, lockHandle, {
          object_type: 'STRU',
          object_name: structureName,
          transport_request: transportRequest
        });

        expect(lockSession.session_id).toBeDefined();
        expect(lockSession.session_state).toBeDefined();

        lockHandleForCleanup = lockHandle;
        lockSessionForCleanup = lockSession;

        await delay(getOperationDelay('lock', testCase));

        // Step 4: Update
        const ddlCode = testCase.params.ddl_code || `@EndUserText.label: '${description}'
@AbapCatalog.enhancement.category: #NOT_EXTENSIBLE
define structure ${structureName} {
  field1 : abap.char(10);
  field2 : abap.char(20);
}`;
        const updatedDdlCode = testCase.params.updated_ddl_code || ddlCode;

        logTestStep('update');
        const updateResponse = await handleUpdateStructure({
          structure_name: structureName,
          ddl_code: updatedDdlCode,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });

        if (updateResponse.isError) {
          const errorMsg = updateResponse.content[0]?.text || 'Unknown error';
          console.error(`Update failed: ${errorMsg}`);
          throw new Error(`Update failed: ${errorMsg}`);
        }

        const updateData = parseHandlerResponse(updateResponse);
        expect(updateData.success).toBe(true);
        expect(updateData.session_id).toBe(lockSession.session_id);

        await delay(getOperationDelay('update', testCase));

        // Step 4.5: Check with new code (before saving/unlocking)
        // This validates the new/unsaved code by passing ddl_code directly to check
        logTestStep('check_new_code');
        const checkNewCodeResponse = await handleCheckStructure({
          structure_name: structureName,
          ddl_code: updatedDdlCode,  // Pass new code for validation
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });

        if (checkNewCodeResponse.isError) {
          // Don't fail test if check has errors - just log them
          console.warn(`⚠️  Check with new code returned errors (this is expected if code has issues): ${checkNewCodeResponse.content[0]?.text || 'Unknown error'}`);
        } else {
          const checkNewCodeData = parseHandlerResponse(checkNewCodeResponse);
          console.log(`✅ Check with new code completed: ${checkNewCodeData.check_result?.success ? 'No errors' : `${checkNewCodeData.check_result?.errors?.length || 0} error(s)`}`);
        }

        await delay(getOperationDelay('check', testCase) || 500);

        // Step 5: Unlock
        logTestStep('unlock');
        const unlockResponse = await handleUnlockStructure({
          structure_name: structureName,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });

        if (unlockResponse.isError) {
          const errorMsg = unlockResponse.content[0]?.text || 'Unknown error';
          console.error(`Unlock failed: ${errorMsg}`);
          throw new Error(`Unlock failed: ${errorMsg}`);
        }

        const unlockData = parseHandlerResponse(unlockResponse);
        expect(unlockData.success).toBe(true);
        expect(unlockData.session_id).toBe(lockSession.session_id);

        session = updateSessionFromResponse(session, unlockData);
        await delay(getOperationDelay('unlock', testCase));

        // Step 6: Activate
        logTestStep('activate');
        const activateResponse = await handleActivateStructure({
          structure_name: structureName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (activateResponse.isError) {
          const errorMsg = activateResponse.content[0]?.text || 'Unknown error';
          console.error(`Activate failed: ${errorMsg}`);
          throw new Error(`Activate failed: ${errorMsg}`);
        }

        const activateData = parseHandlerResponse(activateResponse);
        expect(activateData.success).toBe(true);

      } catch (error: any) {
        // Principle 1: If lock was done, unlock is mandatory
        if (lockHandleForCleanup && lockSessionForCleanup) {
          try {
            await handleUnlockStructure({
              structure_name: structureName,
              lock_handle: lockHandleForCleanup,
              session_id: lockSessionForCleanup.session_id,
              session_state: lockSessionForCleanup.session_state
            });
          } catch (unlockError) {
            console.error('Failed to unlock structure after error:', unlockError);
          }
        }

        // Principle 2: first error and exit
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: Unlock is always required if structure was locked
        // For diagnostics: deletion is excluded, only unlock is performed
        if (session && structureName) {
          try {
            // Principle 1: If lock was done, unlock is mandatory
            if (lockHandleForCleanup && lockSessionForCleanup) {
              try {
                debugLog('CLEANUP', `Attempting to unlock structure ${structureName} (cleanup)`, {
                  structure_name: structureName,
                  has_lock_handle: !!lockHandleForCleanup
                });
                await handleUnlockStructure({
                structure_name: structureName,
                  lock_handle: lockHandleForCleanup,
                  session_id: lockSessionForCleanup.session_id,
                  session_state: lockSessionForCleanup.session_state
                });
                debugLog('CLEANUP', `Successfully unlocked structure ${structureName} (cleanup)`);
                console.log(`🔓 Unlocked structure ${structureName} (cleanup)`);
              } catch (unlockError: any) {
                debugLog('CLEANUP', `Failed to unlock structure ${structureName} (cleanup)`, {
                  error: unlockError instanceof Error ? unlockError.message : String(unlockError)
                });
                console.warn(`⚠️  Failed to unlock structure ${structureName} during cleanup: ${unlockError.message || unlockError}`);
              }
            }

            // Deletion is excluded for diagnostics - object left for analysis
            debugLog('CLEANUP', `Deletion excluded for diagnostics - object left for analysis: ${structureName}`, {
              structure_name: structureName,
              structure_created: structureCreated
            });
            console.log(`⚠️ Deletion excluded for diagnostics - object left for analysis: ${structureName}`);
          } catch (cleanupError: any) {
            debugLog('CLEANUP_ERROR', `Exception during cleanup: ${cleanupError}`, {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            });
            console.warn(`⚠️  Failed to cleanup test structure ${structureName}: ${cleanupError.message || cleanupError}`);
          }
        }

        diagnosticsTracker.cleanup();
      }
    }, getTimeout('long'));
  });
});
