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
  logTestStep
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

      let lockHandleForCleanup: string | null = null;
      let lockSessionForCleanup: SessionInfo | null = null;

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
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: Unlock and optionally delete
        if (session && structureName) {
          try {
            const shouldCleanup = getCleanupAfter(testCase);

            // Always unlock (unlock is always performed)
            if (lockHandleForCleanup && lockSessionForCleanup) {
              try {
                await handleUnlockStructure({
                  structure_name: structureName,
                  lock_handle: lockHandleForCleanup,
                  session_id: lockSessionForCleanup.session_id,
                  session_state: lockSessionForCleanup.session_state
                });
              } catch (unlockError: any) {
                // Silent cleanup failure
              }
            }

            // Delete only if cleanup_after is true
            if (shouldCleanup) {
              await delay(1000);

              const deleteResponse = await handleDeleteStructure({
                structure_name: structureName,
                transport_request: transportRequest
              });

              if (deleteResponse.isError) {
                const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
                console.warn(`⚠️  Failed to delete structure ${structureName}: ${errorMsg}`);
              } else {
                console.log(`🧹 Cleaned up test structure: ${structureName}`);
              }
            } else {
              console.log(`⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${structureName}`);
            }
          } catch (cleanupError: any) {
            console.warn(`⚠️  Failed to cleanup test structure ${structureName}: ${cleanupError.message || cleanupError}`);
          }
        }
      }
    }, getTimeout('long'));
  });
});
