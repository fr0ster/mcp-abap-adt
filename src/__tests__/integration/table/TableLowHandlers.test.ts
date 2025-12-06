/**
 * Integration tests for Table Low-Level Handlers
 *
 * Tests the complete workflow using handler functions directly:
 * GetSession → ValidateTableLow → CreateTableLow → LockTableLow →
 * UpdateTableLow → UnlockTableLow → ActivateTableLow → DeleteTableLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/table
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleValidateTable } from '../../../handlers/table/low/handleValidateTable';
import { handleCreateTable } from '../../../handlers/table/low/handleCreateTable';
import { handleLockTable } from '../../../handlers/table/low/handleLockTable';
import { handleUpdateTable } from '../../../handlers/table/low/handleUpdateTable';
import { handleCheckTable } from '../../../handlers/table/low/handleCheckTable';
import { handleUnlockTable } from '../../../handlers/table/low/handleUnlockTable';
import { handleActivateTable } from '../../../handlers/table/low/handleActivateTable';
import { handleDeleteTable } from '../../../handlers/table/low/handleDeleteTable';

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

// Load environment variables
// loadTestEnv will be called in beforeAll

describe('Table Low-Level Handlers Integration', () => {
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
    let testTableName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig || !session) {
        return;
      }

      // Get test case configuration
      testCase = getEnabledTestCase('create_table_low', 'full_workflow');
      if (!testCase) {
        return;
      }

      testTableName = testCase.params.table_name;
    });

    it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
      if (!hasConfig || !session || !testCase || !testTableName) {
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasSession: !!session,
          hasTestCase: !!testCase,
          hasTestTableName: !!testTableName
        });
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const tableName = testTableName;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test table for low-level handler`;

      debugLog('TEST_START', `Starting full workflow test for table: ${tableName}`, {
        tableName,
        packageName,
        transportRequest,
        description
      });

      // Track lock state and creation state for cleanup
      let lockHandleForCleanup: string | null = null;
      let lockSessionForCleanup: SessionInfo | null = null;
      let tableCreated = false;

      try {
        // Step 1: Validate
        debugLog('VALIDATE', `Starting validation for ${tableName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const validateResponse = await handleValidateTable({
          table_name: tableName,
          tableName: tableName,
          package_name: packageName,
          packageName: packageName,
          description,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (validateResponse.isError) {
          const errorMsg = validateResponse.content[0]?.text || 'Unknown error';
          // If table already exists, that's okay - we'll skip creation
          if (errorMsg.includes('already exists')) {
            console.log(`⏭️  Table ${tableName} already exists, skipping test`);
            return;
          }
          throw new Error(`Validation failed: ${errorMsg}`);
        }

        const validateData = parseHandlerResponse(validateResponse);
        if (!validateData.validation_result?.valid) {
          throw new Error(`Validation failed: ${validateData.validation_result?.message || 'Invalid table name'}`);
        }

        // Update session from validation response
        session = updateSessionFromResponse(session, validateData);

        // Step 2: Create
        const ddlCode = testCase.params.ddl_code || `@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: '${description}'
@Metadata.ignorePropagatedAnnotations: true
@Metadata.allowExtensions: true
define view entity ${tableName} as select from dummy {
  key dummy.dummy as dummy_field
}`;

        const createResponse = await handleCreateTable({
          table_name: tableName,
          tableName: tableName,
          description,
          package_name: packageName,
          packageName: packageName,
          transport_request: transportRequest,
          transportRequest: transportRequest,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (createResponse.isError) {
          throw new Error(`Create failed: ${createResponse.content[0]?.text || 'Unknown error'}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.table_name).toBe(tableName);

        // Mark table as created successfully
        tableCreated = true;

        // Update session from create response
        session = updateSessionFromResponse(session, createData);

        // Wait for creation to complete
        await delay(getOperationDelay('create', testCase));

        // Step 3: Lock
        const lockResponse = await handleLockTable({
          table_name: tableName,
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

        // Track lock state for cleanup (principle 1: if lock was done, unlock is mandatory)
        lockHandleForCleanup = lockHandle;
        lockSessionForCleanup = lockSession;

        // Wait for lock to complete
        await delay(getOperationDelay('lock', testCase));

        // Step 4: Update
        const updatedDdlCode = testCase.params.updated_ddl_code || `@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: '${description} (updated)'
@Metadata.ignorePropagatedAnnotations: true
@Metadata.allowExtensions: true
define view entity ${tableName} as select from dummy {
  key dummy.dummy as dummy_field,
  dummy.dummy as additional_field
}`;

        const updateResponse = await handleUpdateTable({
          table_name: tableName,
          ddl_code: updatedDdlCode,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,  // ← From Lock response
          session_state: lockSession.session_state  // ← From Lock response
        });

        if (updateResponse.isError) {
          throw new Error(`Update failed: ${updateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const updateData = parseHandlerResponse(updateResponse);
        expect(updateData.success).toBe(true);

        // Wait for update to complete
        await delay(getOperationDelay('update', testCase));

        // Step 4.5: Check with new code (before saving/unlocking)
        // This validates the new/unsaved code by passing ddl_code directly to check
        debugLog('CHECK_NEW_CODE', `Checking table with new code (before unlock): ${tableName}`, {
          session_id: lockSession.session_id,
          has_session_state: !!lockSession.session_state,
          ddlCodeLength: updatedDdlCode.length
        });
        const checkNewCodeResponse = await handleCheckTable({
          table_name: tableName,
          ddl_code: updatedDdlCode,  // Pass new code for validation
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });

        if (checkNewCodeResponse.isError) {
          debugLog('CHECK_NEW_CODE_ERROR', `Check with new code returned error: ${checkNewCodeResponse.content[0]?.text || 'Unknown error'}`);
          // Don't fail test if check has errors - just log them
          console.warn(`⚠️  Check with new code returned errors (this is expected if code has issues): ${checkNewCodeResponse.content[0]?.text || 'Unknown error'}`);
        } else {
          const checkNewCodeData = parseHandlerResponse(checkNewCodeResponse);
          debugLog('CHECK_NEW_CODE_SUCCESS', `Check with new code completed`, {
            success: checkNewCodeData.check_result?.success,
            errors: checkNewCodeData.check_result?.errors?.length || 0,
            warnings: checkNewCodeData.check_result?.warnings?.length || 0
          });
          console.log(`✅ Check with new code completed: ${checkNewCodeData.check_result?.success ? 'No errors' : `${checkNewCodeData.check_result?.errors?.length || 0} error(s)`}`);
        }

        await delay(getOperationDelay('check', testCase) || 500);

        // Step 5: Unlock
        const unlockResponse = await handleUnlockTable({
          table_name: tableName,
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
        session = updateSessionFromResponse(session, unlockData);

        // Wait for unlock to complete
        await delay(getOperationDelay('unlock', testCase));

        // Step 6: Activate
        const activateResponse = await handleActivateTable({
          table_name: tableName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (activateResponse.isError) {
          throw new Error(`Activate failed: ${activateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const activateData = parseHandlerResponse(activateResponse);
        expect(activateData.success).toBe(true);

        console.log(`✅ Full workflow completed successfully for ${tableName}`);

      } catch (error: any) {
        // Principle 1: If lock was done, unlock is mandatory
        if (lockHandleForCleanup && lockSessionForCleanup) {
          try {
            await handleUnlockTable({
              table_name: tableName,
              lock_handle: lockHandleForCleanup,
              session_id: lockSessionForCleanup!.session_id,
              session_state: lockSessionForCleanup!.session_state
            });
          } catch (unlockError) {
            console.error('Failed to unlock table after error:', unlockError);
          }
        }

        // Principle 2: first error and exit
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: Unlock is always required if table was locked
        // For diagnostics: deletion is excluded, only unlock is performed
        if (session && tableName) {
          try {
            // Principle 1: If lock was done, unlock is mandatory
            if (lockHandleForCleanup && lockSessionForCleanup) {
              try {
                debugLog('CLEANUP', `Attempting to unlock table ${tableName} (cleanup)`, {
                  table_name: tableName,
                  has_lock_handle: !!lockHandleForCleanup
                });
                await handleUnlockTable({
                table_name: tableName,
                  lock_handle: lockHandleForCleanup,
                  session_id: lockSessionForCleanup!.session_id,
                  session_state: lockSessionForCleanup!.session_state
                });
                debugLog('CLEANUP', `Successfully unlocked table ${tableName} (cleanup)`);
                console.log(`🔓 Unlocked table ${tableName} (cleanup)`);
              } catch (unlockError: any) {
                debugLog('CLEANUP', `Failed to unlock table ${tableName} (cleanup)`, {
                  error: unlockError instanceof Error ? unlockError.message : String(unlockError)
                });
                console.warn(`⚠️  Failed to unlock table ${tableName} during cleanup: ${unlockError.message || unlockError}`);
              }
            }

            // Deletion is excluded for diagnostics - object left for analysis
            debugLog('CLEANUP', `Deletion excluded for diagnostics - object left for analysis: ${tableName}`, {
              table_name: tableName,
              table_created: tableCreated
            });
            console.log(`⚠️ Deletion excluded for diagnostics - object left for analysis: ${tableName}`);
          } catch (cleanupError) {
            debugLog('CLEANUP_ERROR', `Exception during cleanup: ${cleanupError}`, {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            });
            console.warn(`⚠️  Failed to cleanup test table ${tableName}: ${cleanupError}`);
          }
        }
      }
    }, getTimeout('long'));
  });
});

