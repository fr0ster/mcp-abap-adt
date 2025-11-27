/**
 * Integration tests for Function High-Level Handlers
 *
 * Tests all high-level handlers for Function module:
 * - CreateFunctionGroup (high-level) - handles validate, create, activate
 * - CreateFunctionModule (high-level) - handles validate, create, lock, update, check, unlock, activate
 * - UpdateFunctionModule (high-level) - handles lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/function
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleCreateFunctionGroup } from '../../../handlers/function/high/handleCreateFunctionGroup';
import { handleCreateFunctionModule } from '../../../handlers/function/high/handleCreateFunctionModule';
import { handleUpdateFunctionModule } from '../../../handlers/function/high/handleUpdateFunctionModule';
import { handleDeleteFunctionModule } from '../../../handlers/function/low/handleDeleteFunctionModule';
import { handleDeleteFunctionGroup } from '../../../handlers/function/low/handleDeleteFunctionGroup';

import {
  parseHandlerResponse,
  delay,
  debugLog
} from '../helpers/testHelpers';
import {
  getTestSession,
  updateSessionFromResponse,
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


describe('Function High-Level Handlers Integration', () => {
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

  it('should test all Function high-level handlers', async () => {
    if (!hasConfig || !session) {
      console.log('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configurations
    const functionGroupCase = getEnabledTestCase('create_function_group', 'builder_function_group');
    const functionModuleCase = getEnabledTestCase('create_function_module', 'builder_function_module');

    if (!functionGroupCase || !functionModuleCase) {
      console.log('⏭️  Skipping test: No test case configuration');
      return;
    }

    const functionGroupName = functionGroupCase.params.function_group_name;
    const functionModuleName = functionModuleCase.params.function_module_name;
    const packageName = resolvePackageName(functionGroupCase);
    const transportRequest = resolveTransportRequest(functionGroupCase);
    const functionGroupDescription = functionGroupCase.params.description || `Test function group for high-level handler`;
    const functionModuleDescription = functionModuleCase.params.description || `Test function module for high-level handler`;
    const sourceCode = functionModuleCase.params.source_code || `FUNCTION ${functionModuleName}.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"----------------------------------------------------------------------
  WRITE: / 'Hello from ${functionModuleName}'.
ENDFUNCTION.`;

    try {
      // Step 1: Test CreateFunctionGroup (High-Level)
      debugLog('CREATE_FG', `Starting high-level function group creation for ${functionGroupName}`, {
        session_id: session.session_id,
        package_name: packageName,
        description: functionGroupDescription
      });

      let createFGResponse;
      try {
        createFGResponse = await handleCreateFunctionGroup({
          function_group_name: functionGroupName,
          description: functionGroupDescription,
          package_name: packageName,
          transport_request: transportRequest,
          activate: true
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If function group already exists, that's okay - we'll skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName')) {
          console.log(`⏭️  FunctionGroup ${functionGroupName} already exists, skipping test`);
          return;
        }
        throw error;
      }

      if (createFGResponse.isError) {
        const errorMsg = createFGResponse.content[0]?.text || 'Unknown error';
        throw new Error(`CreateFunctionGroup failed: ${errorMsg}`);
      }

      const createFGData = parseHandlerResponse(createFGResponse);
      expect(createFGData.success).toBe(true);
      expect(createFGData.function_group_name).toBe(functionGroupName);

      await delay(getOperationDelay('create', functionGroupCase));
      console.log(`✅ High-level function group creation completed successfully for ${functionGroupName}`);

      // Step 2: Test CreateFunctionModule (High-Level)
      debugLog('CREATE_FM', `Starting high-level function module creation for ${functionModuleName}`, {
        session_id: session.session_id,
        function_group_name: functionGroupName
      });

      let createFMResponse;
      try {
        createFMResponse = await handleCreateFunctionModule({
          function_group_name: functionGroupName,
          function_module_name: functionModuleName,
          description: functionModuleDescription,
          transport_request: transportRequest,
          source_code: sourceCode,
          activate: true
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If function module already exists, that's okay - we'll skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName')) {
          console.log(`⏭️  FunctionModule ${functionModuleName} already exists, skipping test`);
          return;
        }
        throw error;
      }

      if (createFMResponse.isError) {
        const errorMsg = createFMResponse.content[0]?.text || 'Unknown error';
        throw new Error(`CreateFunctionModule failed: ${errorMsg}`);
      }

      const createFMData = parseHandlerResponse(createFMResponse);
      expect(createFMData.success).toBe(true);
      expect(createFMData.function_module_name).toBe(functionModuleName);

      await delay(getOperationDelay('create', functionModuleCase));
      console.log(`✅ High-level function module creation completed successfully for ${functionModuleName}`);

      // Step 3: Test UpdateFunctionModule (High-Level)
      debugLog('UPDATE_FM', `Starting high-level function module update for ${functionModuleName}`, {
        session_id: session.session_id
      });

      const updatedSourceCode = `FUNCTION ${functionModuleName}.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"----------------------------------------------------------------------
  WRITE: / 'Hello from ${functionModuleName} (updated)'.
  WRITE: / 'Additional line'.
ENDFUNCTION.`;

      let updateFMResponse;
      try {
        updateFMResponse = await handleUpdateFunctionModule({
          function_group_name: functionGroupName,
          function_module_name: functionModuleName,
          source_code: updatedSourceCode,
          transport_request: transportRequest,
          activate: true
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If function module doesn't exist or other validation error, skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName') || errorMsg.includes('not found')) {
          console.log(`⏭️  Cannot update function module ${functionModuleName}: ${errorMsg}, skipping test`);
          return;
        }
        throw new Error(`Update failed: ${errorMsg}`);
      }

      if (updateFMResponse.isError) {
        throw new Error(`Update failed: ${updateFMResponse.content[0]?.text || 'Unknown error'}`);
      }

      const updateFMData = parseHandlerResponse(updateFMResponse);
      expect(updateFMData.success).toBe(true);
      expect(updateFMData.function_module_name).toBe(functionModuleName);

      await delay(getOperationDelay('update', functionModuleCase));
      console.log(`✅ High-level function module update completed successfully for ${functionModuleName}`);

    } catch (error: any) {
      console.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Delete test function module first, then function group
      if (session && functionModuleName && functionGroupName) {
        try {
          const deleteFMResponse = await handleDeleteFunctionModule({
            function_module_name: functionModuleName,
            function_group_name: functionGroupName,
            transport_request: transportRequest
          });

          if (!deleteFMResponse.isError) {
            console.log(`🧹 Cleaned up test function module: ${functionModuleName}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️  Failed to cleanup test function module ${functionModuleName}: ${cleanupError}`);
        }
      }

      if (session && functionGroupName) {
        try {
          const deleteFGResponse = await handleDeleteFunctionGroup({
            function_group_name: functionGroupName,
            transport_request: transportRequest
          });

          if (!deleteFGResponse.isError) {
            console.log(`🧹 Cleaned up test function group: ${functionGroupName}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️  Failed to cleanup test function group ${functionGroupName}: ${cleanupError}`);
        }
      }
    }
  }, getTimeout('long'));
});

