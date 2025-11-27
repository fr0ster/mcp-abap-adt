/**
 * Integration tests for FunctionModule Low-Level Handlers
 *
 * Tests the complete workflow using handler functions directly:
 * GetSession → ValidateFunctionModuleLow → CreateFunctionModuleLow → LockFunctionModuleLow →
 * UpdateFunctionModuleLow → UnlockFunctionModuleLow → ActivateFunctionModuleLow → DeleteFunctionModuleLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/functionModule
 */

import { handleValidateFunctionModule } from '../../../handlers/function/low/handleValidateFunctionModule';
import { handleCreateFunctionModule } from '../../../handlers/function/low/handleCreateFunctionModule';
import { handleLockFunctionModule } from '../../../handlers/function/low/handleLockFunctionModule';
import { handleUpdateFunctionModule } from '../../../handlers/function/low/handleUpdateFunctionModule';
import { handleUnlockFunctionModule } from '../../../handlers/function/low/handleUnlockFunctionModule';
import { handleActivateFunctionModule } from '../../../handlers/function/low/handleActivateFunctionModule';
import { handleDeleteFunctionModule } from '../../../handlers/function/low/handleDeleteFunctionModule';

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

describe('FunctionModule Low-Level Handlers Integration', () => {
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
    let testFunctionModuleName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig || !session) {
        return;
      }

      testCase = getEnabledTestCase('create_function_module_low', 'full_workflow');
      if (!testCase) {
        return;
      }

      testFunctionModuleName = testCase.params.function_module_name;
    });

    it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
      if (!hasConfig || !session || !testCase || !testFunctionModuleName) {
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const functionModuleName = testFunctionModuleName;
      const functionGroupName = testCase.params.function_group_name;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test function module for low-level handler`;

      let lockHandleForCleanup: string | null = null;
      let lockSessionForCleanup: SessionInfo | null = null;

      try {
        // Step 1: Validate
        const validateResponse = await handleValidateFunctionModule({
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (validateResponse.isError) {
          const errorMsg = validateResponse.content[0]?.text || 'Unknown error';
          if (errorMsg.includes('already exists')) {
            console.log(`⏭️  FunctionModule ${functionModuleName} already exists, skipping test`);
            return;
          }
          throw new Error(`Validation failed: ${errorMsg}`);
        }

        const validateData = parseHandlerResponse(validateResponse);
        if (!validateData.validation_result?.valid) {
          const message = validateData.validation_result?.message || '';
          const messageLower = message.toLowerCase();
          if (validateData.validation_result?.exists || 
              messageLower.includes('already exists') ||
              messageLower.includes('does already exist')) {
            console.log(`⏭️  FunctionModule ${functionModuleName} already exists, skipping test`);
            return;
          }
          console.warn(`⚠️  Validation failed for ${functionModuleName}: ${message}. Will attempt create and handle if object exists...`);
        }

        session = updateSessionFromResponse(session, validateData);

        // Step 2: Create
        const createResponse = await handleCreateFunctionModule({
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (createResponse.isError) {
          const errorMsg = createResponse.content[0]?.text || 'Unknown error';
          if (errorMsg.includes('already exists') || errorMsg.includes('does already exist')) {
            console.log(`⏭️  FunctionModule ${functionModuleName} already exists, skipping test`);
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.function_module_name).toBe(functionModuleName);

        session = updateSessionFromResponse(session, createData);
        await delay(getOperationDelay('create', testCase));

        // Step 3: Lock
        const lockResponse = await handleLockFunctionModule({
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (lockResponse.isError) {
          throw new Error(`Lock failed: ${lockResponse.content[0]?.text || 'Unknown error'}`);
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
        const sourceCode = testCase.params.source_code || `FUNCTION ${functionModuleName.toLowerCase()}.\n*"----------------------------------------------------------------------\n*"*"Local Interface:\n*"----------------------------------------------------------------------\nENDFUNCTION.`;

        const updateResponse = await handleUpdateFunctionModule({
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          source_code: sourceCode,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });

        if (updateResponse.isError) {
          throw new Error(`Update failed: ${updateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const updateData = parseHandlerResponse(updateResponse);
        expect(updateData.success).toBe(true);
        expect(updateData.session_id).toBe(lockSession.session_id);

        await delay(getOperationDelay('update', testCase));

        // Step 5: Unlock
        const unlockResponse = await handleUnlockFunctionModule({
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });

        if (unlockResponse.isError) {
          throw new Error(`Unlock failed: ${unlockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const unlockData = parseHandlerResponse(unlockResponse);
        expect(unlockData.success).toBe(true);
        expect(unlockData.session_id).toBe(lockSession.session_id);

        session = updateSessionFromResponse(session, unlockData);
        await delay(getOperationDelay('unlock', testCase));

        // Step 6: Activate
        const activateResponse = await handleActivateFunctionModule({
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (activateResponse.isError) {
          throw new Error(`Activate failed: ${activateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const activateData = parseHandlerResponse(activateResponse);
        expect(activateData.success).toBe(true);

        console.log(`✅ Full workflow completed successfully for ${functionModuleName}`);

      } catch (error: any) {
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup
        if (session && functionModuleName) {
          try {
            if (lockHandleForCleanup && lockSessionForCleanup) {
              try {
                await handleUnlockFunctionModule({
                  function_module_name: functionModuleName,
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

            const deleteResponse = await handleDeleteFunctionModule({
              function_module_name: functionModuleName,
              function_group_name: functionGroupName,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              console.log(`🧹 Cleaned up test function module: ${functionModuleName}`);
            } else {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              console.warn(`⚠️  Failed to delete function module ${functionModuleName}: ${errorMsg}`);
            }
          } catch (cleanupError: any) {
            console.warn(`⚠️  Failed to cleanup test function module ${functionModuleName}: ${cleanupError.message || cleanupError}`);
          }
        }
      }
    }, getTimeout('long'));
  });
});
