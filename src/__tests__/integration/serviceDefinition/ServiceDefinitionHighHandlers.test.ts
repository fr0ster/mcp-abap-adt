/**
 * Integration tests for ServiceDefinition High-Level Handlers
 *
 * Tests all high-level handlers for ServiceDefinition module:
 * - CreateServiceDefinition (high-level) - handles validate, create, activate
 * - UpdateServiceDefinition (high-level) - handles validate, lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/serviceDefinition
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleCreateServiceDefinition } from '../../../handlers/service_definition/high/handleCreateServiceDefinition';
import { handleUpdateServiceDefinition } from '../../../handlers/service_definition/high/handleUpdateServiceDefinition';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getManagedConnection } from '../../../lib/utils';

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
  loadTestEnv,
  getCleanupAfter
} from '../helpers/configHelpers';

// Load environment variables
// loadTestEnv will be called in beforeAll


describe('ServiceDefinition High-Level Handlers Integration', () => {
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

  it('should test all ServiceDefinition high-level handlers', async () => {
    if (!hasConfig || !session) {
      console.log('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configuration
    const testCase = getEnabledTestCase('create_service_definition', 'builder_service_definition');
    if (!testCase) {
      console.log('⏭️  Skipping test: No test case configuration');
      return;
    }

    const serviceDefinitionName = testCase.params.service_definition_name;
    const packageName = resolvePackageName(testCase);
    const transportRequest = resolveTransportRequest(testCase);
    const description = testCase.params.description || `Test service definition for high-level handler`;
    const sourceCode = testCase.params.source_code || `service definition ${serviceDefinitionName.toLowerCase()} {
  expose ${serviceDefinitionName.toLowerCase()}_entity;
}`;

    try {
      // Step 1: Test CreateServiceDefinition (High-Level)
      debugLog('CREATE', `Starting high-level service definition creation for ${serviceDefinitionName}`, {
        session_id: session.session_id,
        package_name: packageName,
        description
      });

      let createResponse;
      try {
        createResponse = await handleCreateServiceDefinition({
          service_definition_name: serviceDefinitionName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          source_code: sourceCode,
          activate: true
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If service definition already exists, that's okay - we'll skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName')) {
          console.log(`⏭️  Service Definition ${serviceDefinitionName} already exists, skipping test`);
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
      expect(createData.service_definition_name).toBe(serviceDefinitionName);

      debugLog('CREATE', 'High-level service definition creation completed successfully', {
        service_definition_name: createData.service_definition_name,
        success: createData.success
      });

      await delay(getOperationDelay('create', testCase));
      console.log(`✅ High-level service definition creation completed successfully for ${serviceDefinitionName}`);

      // Step 2: Test UpdateServiceDefinition (High-Level)
      if (testCase.params.update_source_code) {
        debugLog('UPDATE', `Starting high-level service definition update for ${serviceDefinitionName}`, {
          session_id: session.session_id
        });

        const updateResponse = await handleUpdateServiceDefinition({
          service_definition_name: serviceDefinitionName,
          source_code: testCase.params.update_source_code,
          transport_request: transportRequest,
          activate: true
        });

        if (updateResponse.isError) {
          const errorMsg = updateResponse.content[0]?.text || 'Unknown error';
          throw new Error(`Update failed: ${errorMsg}`);
        }

        const updateData = parseHandlerResponse(updateResponse);
        expect(updateData.success).toBe(true);
        expect(updateData.service_definition_name).toBe(serviceDefinitionName);

        debugLog('UPDATE', 'High-level service definition update completed successfully', {
          service_definition_name: updateData.service_definition_name,
          success: updateData.success
        });

        await delay(getOperationDelay('update', testCase));
        console.log(`✅ High-level service definition update completed successfully for ${serviceDefinitionName}`);
      }

    } catch (error: any) {
      console.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Optionally delete test service definition
      if (session && serviceDefinitionName) {
        try {
          const shouldCleanup = getCleanupAfter(testCase);

          // Delete only if cleanup_after is true
          if (shouldCleanup) {
            try {
              const connection = getManagedConnection();
              const client = new CrudClient(connection);
              await client.deleteServiceDefinition(
                { serviceDefinitionName },
                transportRequest
              );
              console.log(`🧹 Cleaned up test service definition: ${serviceDefinitionName}`);
            } catch (deleteError: any) {
              const errorMsg = deleteError.message || String(deleteError);
              console.warn(`⚠️  Failed to delete service definition ${serviceDefinitionName}: ${errorMsg}`);
            }
          } else {
            console.log(`⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${serviceDefinitionName}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️  Failed to cleanup test service definition ${serviceDefinitionName}: ${cleanupError}`);
        }
      }
    }
  }, getTimeout('long'));
});

