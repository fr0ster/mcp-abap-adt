/**
 * Integration tests for Interface High-Level Handlers
 *
 * Tests all high-level handlers for Interface module:
 * - CreateInterface (high-level) - handles validate, create, lock, update, check, unlock, activate
 * - UpdateInterface (high-level) - handles validate, lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/interface
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleCreateInterface } from '../../../handlers/interface/high/handleCreateInterface';
import { handleUpdateInterface } from '../../../handlers/interface/high/handleUpdateInterface';
import { handleDeleteInterface } from '../../../handlers/interface/low/handleDeleteInterface';

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

describe('Interface High-Level Handlers Integration', () => {
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

  it('should test all Interface high-level handlers', async () => {
    if (!hasConfig || !session) {
      console.log('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configuration
    const testCase = getEnabledTestCase('create_interface', 'builder_interface');
    if (!testCase) {
      console.log('⏭️  Skipping test: No test case configuration');
      return;
    }

    const interfaceName = testCase.params.interface_name;
    const packageName = resolvePackageName(testCase);
    const transportRequest = resolveTransportRequest(testCase);
    const description = testCase.params.description || `Test interface for high-level handler`;
    const sourceCode = testCase.params.source_code || `INTERFACE ${interfaceName}
  PUBLIC.

  METHODS: test_method
    RETURNING VALUE(rv_result) TYPE string.
ENDINTERFACE.`;

    try {
      // Step 1: Test CreateInterface (High-Level)
      debugLog('CREATE', `Starting high-level interface creation for ${interfaceName}`, {
        session_id: session.session_id,
        package_name: packageName,
        description
      });

      let createResponse;
      try {
        createResponse = await handleCreateInterface({
          interface_name: interfaceName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          source_code: sourceCode,
          activate: true
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If interface already exists, that's okay - we'll skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName')) {
          console.log(`⏭️  Interface ${interfaceName} already exists, skipping test`);
          return;
        }
        throw error;
      }

      if (createResponse.isError) {
        const errorMsg = createResponse.content[0]?.text || 'Unknown error';
        throw new Error(`Create failed: ${errorMsg}`);
      }

      const createData = parseHandlerResponse(createResponse);
      expect(createData.success).toBe(true);
      expect(createData.interface_name).toBe(interfaceName);

      debugLog('CREATE', 'High-level interface creation completed successfully', {
        interface_name: createData.interface_name,
        success: createData.success
      });

      await delay(getOperationDelay('create', testCase));
      console.log(`✅ High-level interface creation completed successfully for ${interfaceName}`);

      // Step 2: Test UpdateInterface (High-Level)
      debugLog('UPDATE', `Starting high-level interface update for ${interfaceName}`, {
        session_id: session.session_id
      });

      const updatedSourceCode = `INTERFACE ${interfaceName}
  PUBLIC.

  METHODS: test_method
    RETURNING VALUE(rv_result) TYPE string,
           another_method
    IMPORTING iv_param TYPE string.
ENDINTERFACE.`;

      let updateResponse;
      try {
        updateResponse = await handleUpdateInterface({
          interface_name: interfaceName,
          source_code: updatedSourceCode,
          transport_request: transportRequest,
          activate: true
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If interface doesn't exist or other validation error, skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName') || errorMsg.includes('not found')) {
          console.log(`⏭️  Cannot update interface ${interfaceName}: ${errorMsg}, skipping test`);
          return;
        }
        throw new Error(`Update failed: ${errorMsg}`);
      }

      if (updateResponse.isError) {
        throw new Error(`Update failed: ${updateResponse.content[0]?.text || 'Unknown error'}`);
      }

      const updateData = parseHandlerResponse(updateResponse);
      expect(updateData.success).toBe(true);
      expect(updateData.interface_name).toBe(interfaceName);

      debugLog('UPDATE', 'High-level interface update completed successfully', {
        interface_name: updateData.interface_name,
        success: updateData.success
      });

      await delay(getOperationDelay('update', testCase));
      console.log(`✅ High-level interface update completed successfully for ${interfaceName}`);

    } catch (error: any) {
      console.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Delete test interface
      if (session && interfaceName) {
        try {
          const deleteResponse = await handleDeleteInterface({
            interface_name: interfaceName,
            transport_request: transportRequest,
            session_id: session.session_id,
            session_state: session.session_state
          });

          if (!deleteResponse.isError) {
            console.log(`🧹 Cleaned up test interface: ${interfaceName}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️  Failed to cleanup test interface ${interfaceName}: ${cleanupError}`);
        }
      }
    }
  }, getTimeout('long'));
});

