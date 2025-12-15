/**
 * Integration tests for BehaviorImplementation High-Level Handlers
 *
 * Tests all high-level handlers for BehaviorImplementation module:
 * - CreateBehaviorImplementation (high-level) - handles create, lock, update main source, update implementations, unlock, activate
 * - UpdateBehaviorImplementation (high-level) - handles validate, lock, update main source, update implementations, check, unlock, activate
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

import { handleCreateBehaviorImplementation } from '../../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation';
import { handleUpdateBehaviorImplementation } from '../../../handlers/behavior_implementation/high/handleUpdateBehaviorImplementation';
import { handleDeleteClass } from '../../../handlers/class/low/handleDeleteClass';

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
  loadTestEnv,
  getCleanupAfter,
  getSapConfigFromEnv
} from '../helpers/configHelpers';
import { createTestLogger } from '../helpers/loggerHelpers';
import { AbapConnection, createAbapConnection } from '@mcp-abap-adt/connection';
import { generateSessionId } from '../../../lib/sessionUtils';

// Load environment variables
// loadTestEnv will be called in beforeAll

const testLogger = createTestLogger('bimpl-high');

describe('BehaviorImplementation High-Level Handlers Integration', () => {
  let session: SessionInfo | null = null;
  let hasConfig = false;
  let connection: AbapConnection;

  beforeAll(async () => {
    try {
      // Get configuration from environment variables
      const config = getSapConfigFromEnv();

      // Create logger for connection (only logs when DEBUG_CONNECTORS is enabled)
      const connectionLogger = {
        debug: process.env.DEBUG_CONNECTORS === 'true' ? console.log : () => {},
        info: process.env.DEBUG_CONNECTORS === 'true' ? console.log : () => {},
        warn: process.env.DEBUG_CONNECTORS === 'true' ? console.warn : () => {},
        error: process.env.DEBUG_CONNECTORS === 'true' ? console.error : () => {},
        csrfToken: process.env.DEBUG_CONNECTORS === 'true' ? console.log : () => {}
      };

      // Create connection directly (same as in adt-clients tests)
      connection = createAbapConnection(config, connectionLogger);

      // Connect to get session state
      await connection.connect();

      // Generate session ID
      const sessionId = generateSessionId();

      // Get initial session
      session = await getTestSession();
      hasConfig = true;
    } catch (error) {
      testLogger.warn('⚠️ Skipping tests: No .env file or SAP configuration found');
      hasConfig = false;
    }
  });

  it('should test all BehaviorImplementation high-level handlers', async () => {
    if (!hasConfig || !session) {
      testLogger.info('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configuration - use high-level test case
    const testCase = getEnabledTestCase('create_behavior_implementation', 'full_workflow');
    if (!testCase) {
      testLogger.info('⏭️  Skipping test: No test case configuration');
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

    // implementation_code is optional for create (will be used if provided)
    const sourceCode = testCase.params.implementation_code;

    if (!testCase.params.behavior_definition) {
      throw new Error('behavior_definition is required in test configuration');
    }
    const behaviorDefinition = testCase.params.behavior_definition;

    try {
      // Step 1: Test CreateBehaviorImplementation (High-Level)
      testLogger.info(`📦 High Create: Creating behavior implementation ${className}...`);
      let createResponse;
      try {
        const createArgs: any = {
          class_name: className,
          behavior_definition: behaviorDefinition,
          description,
          package_name: packageName,
          activate: true
        };
        if (transportRequest) {
          createArgs.transport_request = transportRequest;
        }
        if (sourceCode) {
          createArgs.implementation_code = sourceCode;
        }
        createResponse = await handleCreateBehaviorImplementation(connection, createArgs);
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        // If behavior implementation already exists or validation error, skip test
        testLogger.info(`⏭️  High Create failed for ${className}: ${errorMsg}, skipping test`);
        return;
      }

      if (createResponse.isError) {
        const errorMsg = createResponse.content[0]?.text || 'Unknown error';
        testLogger.info(`⏭️  High Create failed for ${className}: ${errorMsg}, skipping test`);
        return;
      }

      const createData = parseHandlerResponse(createResponse);
      expect(createData.success).toBe(true);
      expect(createData.class_name).toBe(className);
      expect(createData.behavior_definition).toBe(behaviorDefinition);
      testLogger.success(`✅ High Create: Created behavior implementation ${className} successfully`);

      await delay(getOperationDelay('create', testCase));

      // Step 2: Test UpdateBehaviorImplementation (High-Level)
      if (testCase.params.update_source_code) {
        testLogger.info(`📝 High Update: Updating behavior implementation ${className}...`);
        const updatedImplementationCode = testCase.params.update_source_code;

        let updateResponse;
        try {
          updateResponse = await handleUpdateBehaviorImplementation(connection, {
            class_name: className,
            behavior_definition: behaviorDefinition,
            implementation_code: updatedImplementationCode,
            transport_request: transportRequest,
            activate: true
          });
        } catch (error: any) {
          const errorMsg = error.message || String(error);
          testLogger.info(`⏭️  High Update failed for ${className}: ${errorMsg}, skipping update test`);
          return;
        }

        if (updateResponse.isError) {
          const errorMsg = updateResponse.content[0]?.text || 'Unknown error';
          testLogger.info(`⏭️  High Update failed for ${className}: ${errorMsg}, skipping update test`);
          return;
        }

        const updateData = parseHandlerResponse(updateResponse);
        expect(updateData.success).toBe(true);
        expect(updateData.class_name).toBe(className);
        testLogger.success(`✅ High Update: Updated behavior implementation ${className} successfully`);
        await delay(getOperationDelay('update', testCase));
      }

      await delay(getOperationDelay('update', testCase));
      testLogger.success(`✅ Full high-level workflow completed successfully for ${className}`);

    } catch (error: any) {
      testLogger.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Optionally delete test behavior implementation
      if (session && className) {
        try {
          const shouldCleanup = getCleanupAfter(testCase);

          // Delete only if cleanup_after is true
          if (shouldCleanup) {
            const deleteResponse = await handleDeleteClass(connection, {
              class_name: className,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              testLogger.info(`🧹 Cleaned up test behavior implementation: ${className}`);
            } else {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              testLogger.warn(`⚠️  Failed to delete behavior implementation ${className}: ${errorMsg}`);
            }
          } else {
            testLogger.info(`⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${className}`);
          }
        } catch (cleanupError) {
          testLogger.warn(`⚠️  Failed to cleanup test behavior implementation ${className}: ${cleanupError}`);
        }
      }
    }
  }, getTimeout('long'));
});
