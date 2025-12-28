/**
 * Integration tests for Package High-Level Handlers
 *
 * Tests all high-level handlers for Package module:
 * - CreatePackage (high-level) - handles validate, create, check
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true              - Test execution logs
 *   DEBUG_HANDLERS=true           - Handler logs
 *   DEBUG_ADT_LIBS=true           - Library logs
 *   DEBUG_CONNECTORS=true         - Connection logs
 *   DEBUG_CONNECTION_MANAGER=true - Connection manager logs (getManagedConnection)
 *
 * Run: npm test -- --testPathPattern=integration/package
 */

import type { AbapConnection } from '@mcp-abap-adt/connection';
import { handleCreatePackage } from '../../../../handlers/package/high/handleCreatePackage';
import { handleDeletePackage } from '../../../../handlers/package/low/handleDeletePackage';
import { handleGetSession } from '../../../../handlers/system/readonly/handleGetSession';
import {
  getCleanupAfter,
  getEnabledTestCase,
  getOperationDelay,
  getTimeout,
  loadTestEnv,
  resolvePackageName,
  resolveTransportRequest,
} from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import {
  createTestConnectionAndSession,
  type SessionInfo,
  updateSessionFromResponse,
} from '../../helpers/sessionHelpers';
import {
  debugLog,
  delay,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

// Load environment variables
// loadTestEnv will be called in beforeAll

describe('Package High-Level Handlers Integration', () => {
  let connection: AbapConnection | null = null;
  let session: SessionInfo | null = null;
  let hasConfig = false;
  const testLogger = createTestLogger('package-high');
  beforeAll(async () => {
    try {
      const { connection: testConnection, session: testSession } =
        await createTestConnectionAndSession();
      connection = testConnection;
      session = testSession;
      hasConfig = true;
    } catch (error) {
      if (
        process.env.DEBUG_TESTS === 'true' ||
        process.env.FULL_LOG_LEVEL === 'true'
      ) {
        console.warn(
          '⚠️ Skipping tests: No .env file or SAP configuration found',
        );
      }
      hasConfig = false;
    }
  });

  it(
    'should test all Package high-level handlers',
    async () => {
      if (!hasConfig || !connection || !session) {
        testLogger.info(
          '⏭️  Skipping test: No configuration, connection or session',
        );
        return;
      }

      // Get test case configuration
      const testCase = getEnabledTestCase('create_package', 'builder_package');

      if (!testCase) {
        testLogger.info('⏭️  Skipping test: No test case configuration');
        return;
      }

      // For high-level: package_name = parent package (super_package), test_package = package to create
      // Use resolvePackageName to get super_package from package_name or default_package
      const superPackage = resolvePackageName(testCase); // Parent package (from package_name or default_package)
      const packageName = testCase.params?.test_package; // Package to create
      const transportRequest = resolveTransportRequest(testCase);
      const description =
        testCase.params?.description || `Test package for high-level handler`;

      if (!packageName) {
        testLogger.info('⏭️  Skipping test: test_package not configured');
        return;
      }

      try {
        // Step 1: Create
        testLogger.info(`📦 High Create: Creating package ${packageName}...`);
        let createResponse;
        try {
          const createArgs = {
            package_name: packageName,
            super_package: superPackage,
            description,
            package_type: testCase.params.package_type || 'development',
            software_component: testCase.params.software_component,
            transport_layer: testCase.params.transport_layer,
            transport_request: transportRequest,
            application_component: testCase.params.application_component,
          };
          createResponse = await handleCreatePackage(
            { connection, logger: testLogger },
            createArgs,
          );
        } catch (error: any) {
          const errorMsg = error.message || String(error);
          const errorMsgLower = errorMsg.toLowerCase();
          // If package already exists, that's okay - we'll skip test
          if (
            errorMsgLower.includes('already exists') ||
            errorMsgLower.includes('does already exist') ||
            errorMsgLower.includes('exceptionresourcealreadyexists') ||
            errorMsg.includes('InvalidObjName')
          ) {
            testLogger.info(
              `⏭️  Package ${packageName} already exists, skipping test`,
            );
            return;
          }
          throw error;
        }

        if (createResponse.isError) {
          const errorMsg = createResponse.content[0]?.text || 'Unknown error';
          const errorMsgLower = errorMsg.toLowerCase();
          // If package already exists, that's okay - we'll skip test
          if (
            errorMsgLower.includes('already exists') ||
            errorMsgLower.includes('does already exist') ||
            errorMsgLower.includes('exceptionresourcealreadyexists')
          ) {
            testLogger.info(
              `⏭️  Package ${packageName} already exists, skipping test`,
            );
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.package_name).toBe(packageName);
        testLogger.info(
          `✅ High Create: Created package ${packageName} successfully`,
        );

        // Update session from create response (if session state is returned)
        if (createData.session_id && createData.session_state) {
          session = updateSessionFromResponse(session, createData);
        }

        await delay(getOperationDelay('create', testCase));
      } catch (error: any) {
        testLogger.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: Optionally delete test package
        // For packages, delete must use a new connection (force_new_connection: true)
        // because package may still be locked in the same session after create
        if (packageName) {
          try {
            const shouldCleanup = getCleanupAfter(testCase);

            // Delete only if cleanup_after is true
            if (shouldCleanup) {
              // Wait before delete to ensure package is unlocked after create
              await delay(getOperationDelay('delete', testCase));

              testLogger.info(
                `🧹 Cleanup: Deleting test package ${packageName}...`,
              );
              const cleanupConfig = (connection as any).getConfig?.();
              const deleteResponse = await handleDeletePackage(
                { connection, logger: testLogger },
                {
                  package_name: packageName,
                  transport_request: transportRequest,
                  force_new_connection: true,
                  connection_config: cleanupConfig,
                },
              );

              if (deleteResponse.isError) {
                const errorMsg =
                  deleteResponse.content[0]?.text || 'Unknown error';
                testLogger.warn(
                  `⚠️  Failed to cleanup test package ${packageName}: ${errorMsg}`,
                );
              } else {
                testLogger.info(
                  `✅ Cleanup: Deleted test package ${packageName} successfully`,
                );
              }
            } else {
              testLogger.warn(
                `⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${packageName}`,
              );
            }
          } catch (cleanupError: any) {
            const errorMsg = cleanupError.message || String(cleanupError);
            testLogger.warn(
              `⚠️  Failed to cleanup test package ${packageName}: ${errorMsg}`,
            );
          }
        }
      }
    },
    getTimeout('long'),
  );
});
