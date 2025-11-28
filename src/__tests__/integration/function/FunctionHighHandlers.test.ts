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
 * Run: npm test -- --testPathPattern=integration/function/
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

    if (!functionModuleCase.params.source_code) {
      throw new Error('source_code is required in test configuration for create_function_module');
    }
    // Remove comment blocks from source code as SAP doesn't allow them in function modules
    let sourceCode = functionModuleCase.params.source_code;
    // Remove comment blocks (lines starting with *")
    sourceCode = sourceCode.split('\n').filter(line => !line.trim().startsWith('*"')).join('\n');

    if (!functionModuleCase.params.update_source_code) {
      throw new Error('update_source_code is required in test configuration for create_function_module');
    }
    // Remove comment blocks from update source code as SAP doesn't allow them in function modules
    let updatedSourceCode = functionModuleCase.params.update_source_code;
    // Remove comment blocks (lines starting with *")
    updatedSourceCode = updatedSourceCode.split('\n').filter(line => !line.trim().startsWith('*"')).join('\n');

    try {
      // Step 1: CreateFunctionGroup (High-Level)
      // High-level handler does validation internally, but we check the result
      console.log(`📦 High Create: Creating function group ${functionGroupName}...`);
      console.log(`📦 High Create: Package: ${packageName}, Transport: ${transportRequest || '(empty)'}`);
      const createFGResponse = await handleCreateFunctionGroup({
          function_group_name: functionGroupName,
          description: functionGroupDescription,
          package_name: packageName,
          transport_request: transportRequest,
          activate: true
        });

      if (createFGResponse.isError) {
        throw new Error(`CreateFunctionGroup failed: ${createFGResponse.content[0]?.text || 'Unknown error'}`);
      }

      const createFGData = parseHandlerResponse(createFGResponse);
      console.log(`✅ High Create: Created function group ${functionGroupName} successfully`);

      await delay(getOperationDelay('create', functionGroupCase));

      // Step 2: CreateFunctionModule (High-Level)
      console.log(`📦 High Create: Creating function module ${functionModuleName}...`);
      const createFMResponse = await handleCreateFunctionModule({
          function_group_name: functionGroupName,
          function_module_name: functionModuleName,
          description: functionModuleDescription,
          transport_request: transportRequest,
          source_code: sourceCode,
          activate: true
        });

      if (createFMResponse.isError) {
        throw new Error(`CreateFunctionModule failed: ${createFMResponse.content[0]?.text || 'Unknown error'}`);
      }

      const createFMData = parseHandlerResponse(createFMResponse);
      console.log(`✅ High Create: Created function module ${functionModuleName} successfully`);

      await delay(getOperationDelay('create', functionModuleCase));

      // Step 3: UpdateFunctionModule (High-Level)
      console.log(`📝 High Update: Updating function module ${functionModuleName}...`);
      const updateFMResponse = await handleUpdateFunctionModule({
          function_group_name: functionGroupName,
          function_module_name: functionModuleName,
          source_code: updatedSourceCode,
          transport_request: transportRequest,
          activate: true
        });

      if (updateFMResponse.isError) {
        throw new Error(`UpdateFunctionModule failed: ${updateFMResponse.content[0]?.text || 'Unknown error'}`);
      }

      const updateFMData = parseHandlerResponse(updateFMResponse);
      console.log(`✅ High Update: Updated function module ${functionModuleName} successfully`);

      await delay(getOperationDelay('update', functionModuleCase));
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

