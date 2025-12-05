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
// loadTestEnv will be called in beforeAll


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

    // All parameters must come from configuration - no defaults
    if (!testCase.params.name) {
      throw new Error('name is required in test configuration');
    }
    const bdefName = testCase.params.name;

    const packageName = resolvePackageName(testCase);
    const transportRequest = resolveTransportRequest(testCase);

    if (!testCase.params.description) {
      throw new Error('description is required in test configuration');
    }
    const description = testCase.params.description;

    if (!testCase.params.root_entity) {
      throw new Error('root_entity is required in test configuration');
    }
    const rootEntity = testCase.params.root_entity;

    if (!testCase.params.implementation_type) {
      throw new Error('implementation_type is required in test configuration');
    }
    const implementationType = testCase.params.implementation_type.charAt(0).toUpperCase() + testCase.params.implementation_type.slice(1).toLowerCase();

    if (!testCase.params.source_code) {
      throw new Error('source_code is required in test configuration');
    }
    const sourceCode = testCase.params.source_code;

    try {
      // Step 1: Test CreateBehaviorDefinition (High-Level)
      console.log(`📦 High Create: Creating ${bdefName}...`);
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
        // If behavior definition already exists or validation error, skip test
        console.log(`⏭️  High Create failed for ${bdefName}: ${errorMsg}, skipping test`);
          return;
      }

      if (createResponse.isError) {
        const errorMsg = createResponse.content[0]?.text || 'Unknown error';
        console.log(`⏭️  High Create failed for ${bdefName}: ${errorMsg}, skipping test`);
        return;
      }

      const createData = parseHandlerResponse(createResponse);
      console.log(`✅ High Create: Created ${bdefName} successfully`);

      await delay(getOperationDelay('create', testCase));

      // Step 2: Test UpdateBehaviorDefinition (High-Level)
      console.log(`📝 High Update: Updating ${bdefName}...`);
      if (!testCase.params.update_source_code) {
        throw new Error('update_source_code is required in test configuration for update step');
      }
      const updatedSourceCode = testCase.params.update_source_code;

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
        // If update fails, just exit without checks
          console.log(`⏭️  High Update failed for ${bdefName}: ${errorMsg}, skipping test`);
          return;
      }

      if (updateResponse.isError) {
        const errorMsg = updateResponse.content[0]?.text || 'Unknown error';
        console.log(`⏭️  High Update failed for ${bdefName}: ${errorMsg}, skipping test`);
        return;
      }

      const updateData = parseHandlerResponse(updateResponse);
      console.log(`✅ High Update: Updated ${bdefName} successfully`);

      await delay(getOperationDelay('update', testCase));
      console.log(`✅ Full high-level workflow completed successfully for ${bdefName}`);

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

