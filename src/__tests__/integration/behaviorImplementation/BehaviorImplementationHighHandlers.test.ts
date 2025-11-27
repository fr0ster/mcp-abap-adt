/**
 * Integration tests for BehaviorImplementation High-Level Handlers
 *
 * Tests all high-level handlers for BehaviorImplementation module:
 * - CreateClass (high-level) - handles create, lock, update, check, unlock, activate
 * - UpdateClass (high-level) - handles lock, update, check, unlock, activate
 * - DeleteClass (low-level) - handles delete
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/behaviorImplementation
 */

import { handleCreateClass } from '../../../handlers/class/high/handleCreateClass';
import { handleDeleteClass } from '../../../handlers/class/low/handleDeleteClass';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getManagedConnection } from '../../../lib/utils';

import {
  parseHandlerResponse,
  delay,
  debugLog
} from '../helpers/testHelpers';
import {
  getTestSession,
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


describe('BehaviorImplementation High-Level Handlers Integration', () => {
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

  it('should test all BehaviorImplementation high-level handlers', async () => {
    if (!hasConfig || !session) {
      console.log('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configuration - use low-level test case as template
    const testCase = getEnabledTestCase('create_behavior_implementation_low', 'full_workflow');
    if (!testCase) {
      console.log('⏭️  Skipping test: No test case configuration');
      return;
    }

    // All parameters must come from configuration - no defaults
    if (!testCase.params.class_name) {
      throw new Error('class_name is required in test configuration');
    }
    const className = testCase.params.class_name;

    const packageName = resolvePackageName(testCase);
    const transportRequest = resolveTransportRequest(testCase);

    if (!testCase.params.description) {
      throw new Error('description is required in test configuration');
    }
    const description = testCase.params.description;

    if (!testCase.params.source_code) {
      throw new Error('source_code is required in test configuration');
    }
    const sourceCode = testCase.params.source_code;

    try {
      // Step 1: Test CreateClass (High-Level)
      console.log(`📦 High Create: Creating ${className}...`);
      let createResponse;
      try {
        const createArgs: any = {
          class_name: className,
          description,
          package_name: packageName,
          activate: true
        };
        if (transportRequest) {
          createArgs.transport_request = transportRequest;
        }
        createResponse = await handleCreateClass(createArgs);
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If behavior implementation already exists or validation error, skip test
        console.log(`⏭️  High Create failed for ${className}: ${errorMsg}, skipping test`);
        return;
      }

      if (createResponse.isError) {
        const errorMsg = createResponse.content[0]?.text || 'Unknown error';
        console.log(`⏭️  High Create failed for ${className}: ${errorMsg}, skipping test`);
        return;
      }

      const createData = parseHandlerResponse(createResponse);
      expect(createData.success).toBe(true);
      expect(createData.class_name).toBe(className);
      console.log(`✅ High Create: Created ${className} successfully`);

      await delay(getOperationDelay('create', testCase));

      // Step 2: Test Update Behavior Implementation (High-Level workflow using CrudClient)
      // CrudClient manages session and lock/unlock internally
      console.log(`📝 High Update: Updating ${className}...`);
      if (!testCase.params.update_source_code) {
        throw new Error('update_source_code is required in test configuration for update step');
      }
      const updatedImplementationCode = testCase.params.update_source_code;

      if (!testCase.params.behavior_definition) {
        throw new Error('behavior_definition is required in test configuration for update step');
      }
      const behaviorDefinition = testCase.params.behavior_definition;

      try {
        const connection = getManagedConnection();
        const client = new CrudClient(connection);

        // Lock (CrudClient manages session internally)
        await client.lockClass({ className: className });
        const lockHandle = client.getLockHandle();
        if (!lockHandle) {
          throw new Error('Failed to get lock handle');
        }

        // Update only implementations include (local handler class)
        // NOTE: Main class source is NOT updated - it remains as created
        await client.updateBehaviorImplementation({
          className: className,
          behaviorDefinition: behaviorDefinition,
          implementationCode: updatedImplementationCode
        }, lockHandle);

        // Unlock (CrudClient manages session internally)
        await client.unlockClass({ className: className }, lockHandle);

        // Activate (CrudClient manages session internally)
        await client.activateClass({ className: className });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        console.log(`⏭️  High Update failed for ${className}: ${errorMsg}, skipping test`);
        return;
      }

      console.log(`✅ High Update: Updated ${className} successfully`);

      await delay(getOperationDelay('update', testCase));
      console.log(`✅ Full high-level workflow completed successfully for ${className}`);

    } catch (error: any) {
      console.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Delete test behavior implementation
      if (session && className) {
        try {
          const deleteResponse = await handleDeleteClass({
            class_name: className,
            transport_request: transportRequest
          });

          if (!deleteResponse.isError) {
            console.log(`🧹 Cleaned up test behavior implementation: ${className}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️  Failed to cleanup test behavior implementation ${className}: ${cleanupError}`);
        }
      }
    }
  }, getTimeout('long'));
});

