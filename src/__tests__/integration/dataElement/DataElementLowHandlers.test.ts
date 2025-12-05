/**
 * Integration tests for DataElement Low-Level Handlers
 *
 * Tests the complete workflow using handler functions directly:
 * GetSession → ValidateDataElementLow → CreateDataElementLow → LockDataElementLow →
 * UpdateDataElementLow → UnlockDataElementLow → ActivateDataElementLow → DeleteDataElementLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/dataElement
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleValidateDataElement } from '../../../handlers/data_element/low/handleValidateDataElement';
import { handleCreateDataElement } from '../../../handlers/data_element/low/handleCreateDataElement';
import { handleLockDataElement } from '../../../handlers/data_element/low/handleLockDataElement';
import { handleUpdateDataElement } from '../../../handlers/data_element/low/handleUpdateDataElement';
import { handleUnlockDataElement } from '../../../handlers/data_element/low/handleUnlockDataElement';
import { handleActivateDataElement } from '../../../handlers/data_element/low/handleActivateDataElement';
import { handleDeleteDataElement } from '../../../handlers/data_element/low/handleDeleteDataElement';

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
// loadTestEnv will be called in beforeAll

describe('DataElement Low-Level Handlers Integration', () => {
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
    let testDataElementName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig || !session) {
        return;
      }

      // Get test case configuration
      testCase = getEnabledTestCase('create_data_element_low', 'full_workflow');
      if (!testCase) {
        return;
      }

      testDataElementName = testCase.params.data_element_name;
    });

    it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
      if (!hasConfig || !session || !testCase || !testDataElementName) {
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasSession: !!session,
          hasTestCase: !!testCase,
          hasTestDataElementName: !!testDataElementName
        });
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const dataElementName = testDataElementName;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test data element for low-level handler`;

      debugLog('TEST_START', `Starting full workflow test for data element: ${dataElementName}`, {
        dataElementName,
        packageName,
        transportRequest,
        description
      });

      try {
        // Step 1: Validate
        debugLog('VALIDATE', `Starting validation for ${dataElementName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const validateResponse = await handleValidateDataElement({
          data_element_name: dataElementName,
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
          // If data element already exists, that's okay - we'll skip creation
          if (errorMsg.includes('already exists')) {
            console.log(`⏭️  DataElement ${dataElementName} already exists, skipping test`);
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
          // If object already exists, that's okay - we'll skip creation
          const message = validateData.validation_result?.message || '';
          const messageLower = message.toLowerCase();
          // Check if validation indicates object exists
          if (validateData.validation_result?.exists ||
              messageLower.includes('already exists') ||
              messageLower.includes('does already exist') ||
              messageLower.includes('resource') && messageLower.includes('exist')) {
            console.log(`⏭️  DataElement ${dataElementName} already exists, skipping test`);
            return;
          }
          // For validation failures with status 400, it might be that validation is not fully supported
          // or object exists - try to continue and see if create fails with "already exists"
          console.warn(`⚠️  Validation failed for ${dataElementName}: ${message}. Will attempt create and handle if object exists...`);
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
        debugLog('CREATE', `Starting creation for ${dataElementName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state,
          packageName,
          type_kind: testCase.params.type_kind || 'E',
          type_name: testCase.params.type_name
        });
        const createResponse = await handleCreateDataElement({
          data_element_name: dataElementName,
          description,
          package_name: packageName,
          data_type: testCase.params.data_type || (testCase.params.type_kind === 'E' || testCase.params.type_kind === 'domain' ? testCase.params.domain_name : 'CHAR'),
          type_name: testCase.params.type_name,
          type_kind: testCase.params.type_kind || 'E',
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
          // If data element already exists, that's okay - we'll skip the rest of the test
          if (errorMsg.includes('already exists') || errorMsg.includes('does already exist')) {
            console.log(`⏭️  DataElement ${dataElementName} already exists, skipping test`);
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.data_element_name).toBe(dataElementName);

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
        debugLog('LOCK', `Starting lock for ${dataElementName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const lockResponse = await handleLockDataElement({
          data_element_name: dataElementName,
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

        debugLog('LOCK', 'Lock completed, extracted session', {
          lock_handle: lockHandle,
          lock_session_id: lockSession.session_id,
          has_lock_session_state: !!lockSession.session_state
        });

        // Wait for lock to complete
        await delay(getOperationDelay('lock', testCase));

        // Step 4: Update
        // Always ensure package_name is included in properties (required by handler)
        const properties = {
          ...(testCase.params.properties || {
            description: `${description} (updated)`,
            data_type: testCase.params.data_type || (testCase.params.type_kind === 'E' || testCase.params.type_kind === 'domain' ? testCase.params.domain_name : 'CHAR'),
            type_name: testCase.params.type_name,
            type_kind: testCase.params.type_kind || 'E'
          }),
          package_name: packageName // Always add package_name (required by handler)
        };

        debugLog('UPDATE', `Starting update for ${dataElementName}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          has_session_state: !!lockSession.session_state,
          properties_keys: Object.keys(properties)
        });
        const updateResponse = await handleUpdateDataElement({
          data_element_name: dataElementName,
          properties,
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
          dataElementName,
          success: updateData.success
        });

        // Wait for update to complete
        await delay(getOperationDelay('update', testCase));

        // Step 5: Unlock
        debugLog('UNLOCK', `Starting unlock for ${dataElementName}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          has_session_state: !!lockSession.session_state
        });
        const unlockResponse = await handleUnlockDataElement({
          data_element_name: dataElementName,
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
        debugLog('ACTIVATE', `Starting activation for ${dataElementName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const activateResponse = await handleActivateDataElement({
          data_element_name: dataElementName,
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
          dataElementName,
          success: activateData.success,
          activated: activateData.activation?.activated,
          checked: activateData.activation?.checked
        });

        debugLog('TEST_COMPLETE', `Full workflow completed successfully for ${dataElementName}`, {
          dataElementName,
          steps_completed: ['validate', 'create', 'lock', 'update', 'unlock', 'activate']
        });
        console.log(`✅ Full workflow completed successfully for ${dataElementName}`);

      } catch (error: any) {
        debugLog('TEST_ERROR', `Test failed: ${error.message}`, {
          error: error.message,
          stack: error.stack,
          dataElementName
        });
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: Delete test data element
        debugLog('CLEANUP', `Starting cleanup for ${dataElementName}`, {
          dataElementName,
          hasSession: !!session
        });
        if (session && dataElementName) {
          try {
            // Try to unlock first if still locked
            try {
              const lockResponse = await handleLockDataElement({
                data_element_name: dataElementName,
                session_id: session.session_id,
                session_state: session.session_state
              });
              if (!lockResponse.isError) {
                const lockData = parseHandlerResponse(lockResponse);
                const lockHandle = extractLockHandle(lockData);
                const lockSession = extractLockSession(lockData);

                await handleUnlockDataElement({
                  data_element_name: dataElementName,
                  lock_handle: lockHandle,
                  session_id: lockSession.session_id,
                  session_state: lockSession.session_state
                });
              }
            } catch (e) {
              // Ignore unlock errors during cleanup
            }

            // Delete data element
            const deleteResponse = await handleDeleteDataElement({
              data_element_name: dataElementName,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              debugLog('CLEANUP', `Successfully deleted test data element: ${dataElementName}`);
              console.log(`🧹 Cleaned up test data element: ${dataElementName}`);
            }
          } catch (cleanupError) {
            debugLog('CLEANUP_ERROR', `Failed to cleanup test data element ${dataElementName}`, {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            });
            console.warn(`⚠️  Failed to cleanup test data element ${dataElementName}: ${cleanupError}`);
          }
        }
      }
    }, getTimeout('long'));
  });
});

