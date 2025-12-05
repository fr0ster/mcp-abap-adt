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
 * Run: npm test -- --testPathPattern=integration/functionModule/
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
  loadTestEnv,
  getCleanupAfter
} from '../helpers/configHelpers';

// Load environment variables
// loadTestEnv will be called in beforeAll

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
        // Step 1: Validate Function Module
        // Validation will check both Function Module and Function Group (via fugrname parameter)
        console.log(`🔍 Step 1: Validating ${functionModuleName}...`);
        debugLog('VALIDATE_FM', `Validating function module ${functionModuleName}`, {
          session_id: session.session_id,
          function_group_name: functionGroupName
        });

        const validateResponse = await handleValidateFunctionModule({
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          description,
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
          // Check if function group doesn't exist (common error: "Function group X unknown")
          if (messageLower.includes('unknown') && messageLower.includes('function group')) {
            console.log(`⏭️  Function Group ${functionGroupName} does not exist. Skipping test. Please create the function group first.`);
            return;
          }
          throw new Error(`Function Module validation failed: ${message}. Cannot proceed.`);
        }

        session = updateSessionFromResponse(session, validateData);
        console.log(`✅ Step 1: Validation successful for ${functionModuleName}`);

        // Step 2: Create
        console.log(`📦 Step 2: Creating ${functionModuleName}...`);
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
        console.log(`✅ Step 2: Created ${functionModuleName} successfully`);

        session = updateSessionFromResponse(session, createData);
        await delay(getOperationDelay('create', testCase));

        // Step 3: Lock
        console.log(`🔒 Step 3: Locking ${functionModuleName}...`);
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
        console.log(`✅ Step 3: Locked ${functionModuleName} successfully`);

        await delay(getOperationDelay('lock', testCase));

        // Step 4: Update
        console.log(`📝 Step 4: Updating ${functionModuleName}...`);
        // Remove comment blocks from source code as SAP doesn't allow them in function modules
        let sourceCode = testCase.params.source_code || `FUNCTION ${functionModuleName.toLowerCase()}.\nENDFUNCTION.`;
        // Remove comment blocks (lines starting with *")
        sourceCode = sourceCode.split('\n').filter(line => !line.trim().startsWith('*"')).join('\n');

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
        console.log(`✅ Step 4: Updated ${functionModuleName} successfully`);

        // Update lock session from update response (session state may have changed)
        const updatedLockSession = updateSessionFromResponse(lockSession, updateData);

        // Use lock handle from update response if available, otherwise use the original one
        const unlockLockHandle = updateData.lock_handle || lockHandle;

        await delay(getOperationDelay('update', testCase));

        // Step 5: Unlock
        console.log(`🔓 Step 5: Unlocking ${functionModuleName}...`);
        const unlockResponse = await handleUnlockFunctionModule({
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          lock_handle: unlockLockHandle,
          session_id: updatedLockSession.session_id,
          session_state: updatedLockSession.session_state
        });

        if (unlockResponse.isError) {
          throw new Error(`Unlock failed: ${unlockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const unlockData = parseHandlerResponse(unlockResponse);
        expect(unlockData.success).toBe(true);
        expect(unlockData.session_id).toBe(lockSession.session_id);
        console.log(`✅ Step 5: Unlocked ${functionModuleName} successfully`);

        session = updateSessionFromResponse(session, unlockData);
        await delay(getOperationDelay('unlock', testCase));

        // Step 6: Activate
        console.log(`⚡ Step 6: Activating ${functionModuleName}...`);
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
        console.log(`✅ Step 6: Activated ${functionModuleName} successfully`);

        console.log(`✅ Full workflow completed successfully for ${functionModuleName}`);

      } catch (error: any) {
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: Unlock and optionally delete
        if (session && functionModuleName) {
          try {
            const shouldCleanup = getCleanupAfter(testCase);

            // Always unlock (unlock is always performed)
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

            // Delete only if cleanup_after is true
            if (shouldCleanup) {
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
            } else {
              console.log(`⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${functionModuleName}`);
            }
          } catch (cleanupError: any) {
            console.warn(`⚠️  Failed to cleanup test function module ${functionModuleName}: ${cleanupError.message || cleanupError}`);
          }
        }
      }
    }, getTimeout('long'));
  });
});
