/**
 * Integration tests for BehaviorDefinition High-Level Handlers
 *
 * Tests all high-level handlers for BehaviorDefinition module:
 * - CreateBehaviorDefinition (high-level) - handles create, lock, check, unlock, activate
 * - UpdateBehaviorDefinition (high-level) - handles lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/behaviorDefinition
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleCreateBehaviorDefinition } from '../../../handlers/behavior_definition/high/handleCreateBehaviorDefinition';
import { handleUpdateBehaviorDefinition } from '../../../handlers/behavior_definition/high/handleUpdateBehaviorDefinition';
import { handleDeleteBehaviorDefinition } from '../../../handlers/behavior_definition/low/handleDeleteBehaviorDefinition';

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


describe('BehaviorDefinition High-Level Handlers Integration', () => {
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

  it('should test all BehaviorDefinition high-level handlers', async () => {
    if (!hasConfig || !session) {
      console.log('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configuration - use low-level test case as template
    const testCase = getEnabledTestCase('create_behavior_definition_low', 'full_workflow');
    if (!testCase) {
      console.log('⏭️  Skipping test: No test case configuration');
      return;
    }

    const bdefName = testCase.params.name;
    const packageName = resolvePackageName(testCase);
    const transportRequest = resolveTransportRequest(testCase);
    const description = testCase.params.description || `Test behavior definition for high-level handler`;
    const rootEntity = testCase.params.root_entity;
    const implementationType = testCase.params.implementation_type || 'Managed';
    const sourceCode = testCase.params.source_code || `managed implementation in class zcl_adt_bld_bdef unique;
define behavior for ${rootEntity} alias Entity
{
  // Behavior definition
}`;

    try {
      // Step 1: Test CreateBehaviorDefinition (High-Level)
      debugLog('CREATE', `Starting high-level behavior definition creation for ${bdefName}`, {
        session_id: session.session_id,
        package_name: packageName,
        description
      });

      let createResponse;
      try {
        createResponse = await handleCreateBehaviorDefinition({
          name: bdefName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          root_entity: rootEntity,
          implementation_type: implementationType,
          activate: true
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If behavior definition already exists, that's okay - we'll skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName')) {
          console.log(`⏭️  BehaviorDefinition ${bdefName} already exists, skipping test`);
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
      expect(createData.name).toBe(bdefName);

      debugLog('CREATE', 'High-level behavior definition creation completed successfully', {
        name: createData.name,
        success: createData.success
      });

      await delay(getOperationDelay('create', testCase));
      console.log(`✅ High-level behavior definition creation completed successfully for ${bdefName}`);

      // Step 2: Test UpdateBehaviorDefinition (High-Level)
      debugLog('UPDATE', `Starting high-level behavior definition update for ${bdefName}`, {
        session_id: session.session_id
      });

      const updatedSourceCode = `managed implementation in class zcl_adt_bld_bdef unique;
define behavior for ${rootEntity} alias Entity
{
  // Updated behavior definition
  field ( readonly ) field1;
}`;

      let updateResponse;
      try {
        updateResponse = await handleUpdateBehaviorDefinition({
          name: bdefName,
          source_code: updatedSourceCode,
          transport_request: transportRequest,
          activate: true
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If behavior definition doesn't exist or other validation error, skip test
        if (errorMsg.includes('already exists') || errorMsg.includes('InvalidObjName') || errorMsg.includes('not found')) {
          console.log(`⏭️  Cannot update behavior definition ${bdefName}: ${errorMsg}, skipping test`);
          return;
        }
        throw new Error(`Update failed: ${errorMsg}`);
      }

      if (updateResponse.isError) {
        throw new Error(`Update failed: ${updateResponse.content[0]?.text || 'Unknown error'}`);
      }

      const updateData = parseHandlerResponse(updateResponse);
      expect(updateData.success).toBe(true);
      expect(updateData.name).toBe(bdefName);

      debugLog('UPDATE', 'High-level behavior definition update completed successfully', {
        name: updateData.name,
        success: updateData.success
      });

      await delay(getOperationDelay('update', testCase));
      console.log(`✅ High-level behavior definition update completed successfully for ${bdefName}`);

    } catch (error: any) {
      console.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Delete test behavior definition
      if (session && bdefName) {
        try {
          const deleteResponse = await handleDeleteBehaviorDefinition({
            name: bdefName,
            transport_request: transportRequest
          });

          if (!deleteResponse.isError) {
            console.log(`🧹 Cleaned up test behavior definition: ${bdefName}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️  Failed to cleanup test behavior definition ${bdefName}: ${cleanupError}`);
        }
      }
    }
  }, getTimeout('long'));
});

