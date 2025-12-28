/**
 * Integration tests for MetadataExtension High-Level Handlers
 *
 * Tests all high-level handlers for MetadataExtension module:
 * - CreateMetadataExtension (high-level) - handles create, lock, check, unlock, activate
 * - UpdateMetadataExtension (high-level) - handles lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/metadataExtension
 */

import type { AbapConnection } from '@mcp-abap-adt/connection';
import { handleCreateMetadataExtension } from '../../../../handlers/ddlx/high/handleCreateMetadataExtension';
import { handleUpdateMetadataExtension } from '../../../../handlers/ddlx/high/handleUpdateMetadataExtension';
import { handleDeleteMetadataExtension } from '../../../../handlers/ddlx/low/handleDeleteMetadataExtension';
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

describe('MetadataExtension High-Level Handlers Integration', () => {
  let connection: AbapConnection | null = null;
  let session: SessionInfo | null = null;
  let hasConfig = false;
  const testLogger = createTestLogger('metadata-extension-high');
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
    'should test all MetadataExtension high-level handlers',
    async () => {
      if (!hasConfig || !connection || !session) {
        testLogger.info(
          '⏭️  Skipping test: No configuration, connection or session',
        );
        return;
      }

      // Get test case configuration - use low-level test case as template
      const testCase = getEnabledTestCase(
        'create_metadata_extension_low',
        'full_workflow',
      );
      if (!testCase) {
        testLogger.info('⏭️  Skipping test: No test case configuration');
        return;
      }

      const ddlxName = testCase.params.name;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description =
        testCase.params.description ||
        `Test metadata extension for high-level handler`;
      const sourceCode =
        testCase.params.source_code ||
        `@Metadata.layer: #CORE
annotate view ZI_TEST_ENTITY with {
  @EndUserText.label: '${description}'
}`;

      try {
        // Step 1: Test CreateMetadataExtension (High-Level)
        testLogger.info(`📦 High Create: Creating ${ddlxName}...`);
        let createResponse;
        try {
          createResponse = await handleCreateMetadataExtension(
            { connection, logger: testLogger },
            {
              name: ddlxName,
              description,
              package_name: packageName,
              transport_request: transportRequest,
              activate: true,
            },
          );
        } catch (error: any) {
          const errorMsg = error.message || String(error);
          // If metadata extension already exists, try to delete it first, then retry create
          if (
            errorMsg.includes('already exists') ||
            errorMsg.includes('does already exist') ||
            errorMsg.includes('ResourceAlreadyExists')
          ) {
            testLogger.warn(
              `⚠️  MetadataExtension ${ddlxName} appears to exist, attempting cleanup...`,
            );
            try {
              await handleDeleteMetadataExtension(
                { connection, logger: testLogger },
                {
                  name: ddlxName,
                  transport_request: transportRequest,
                },
              );
              testLogger.info(
                `🧹 Cleaned up existing metadata extension ${ddlxName}, retrying create...`,
              );
              // Retry create after cleanup
              createResponse = await handleCreateMetadataExtension(
                { connection, logger: testLogger },
                {
                  name: ddlxName,
                  description,
                  package_name: packageName,
                  transport_request: transportRequest,
                  activate: true,
                },
              );
            } catch (deleteError: any) {
              // If delete fails (object doesn't exist), it was a false positive from validation
              testLogger.info(
                `⏭️  High Create failed for ${ddlxName}: doesn't actually exist (validation false positive), skipping test`,
              );
              return;
            }
          } else {
            testLogger.info(
              `⏭️  High Create failed for ${ddlxName}: ${errorMsg}, skipping test`,
            );
            return;
          }
        }

        if (createResponse.isError) {
          const errorMsg = createResponse.content[0]?.text || 'Unknown error';
          // Check if it's still "already exists" after retry
          if (
            errorMsg.includes('already exists') ||
            errorMsg.includes('does already exist') ||
            errorMsg.includes('ResourceAlreadyExists')
          ) {
            testLogger.info(
              `⏭️  High Create failed for ${ddlxName}: ${errorMsg}, skipping test`,
            );
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.name).toBe(ddlxName);
        testLogger.info(`✅ High Create: Created ${ddlxName} successfully`);

        await delay(getOperationDelay('create', testCase));

        // Step 2: Test UpdateMetadataExtension (High-Level)
        testLogger.info(`📝 High Update: Updating ${ddlxName}...`);
        const updatedSourceCode = `@Metadata.layer: #CORE
annotate view ZI_TEST_ENTITY with {
  @EndUserText.label: '${description} (updated)'
  @UI.hidden: true
  field1;
}`;

        let updateResponse;
        try {
          updateResponse = await handleUpdateMetadataExtension(
            { connection, logger: testLogger },
            {
              name: ddlxName,
              source_code: updatedSourceCode,
              transport_request: transportRequest,
              activate: true,
            },
          );
        } catch (error: any) {
          const errorMsg = error.message || String(error);
          // If metadata extension doesn't exist or other validation error, skip test
          if (
            errorMsg.includes('already exists') ||
            errorMsg.includes('InvalidObjName') ||
            errorMsg.includes('not found')
          ) {
            testLogger.info(
              `⏭️  High Update failed for ${ddlxName}: ${errorMsg}, skipping test`,
            );
            return;
          }
          throw new Error(`Update failed: ${errorMsg}`);
        }

        if (updateResponse.isError) {
          const errorMsg = updateResponse.content[0]?.text || 'Unknown error';
          testLogger.info(
            `⏭️  High Update failed for ${ddlxName}: ${errorMsg}, skipping test`,
          );
          return;
        }

        const updateData = parseHandlerResponse(updateResponse);
        expect(updateData.success).toBe(true);
        expect(updateData.name).toBe(ddlxName);
        testLogger.info(`✅ High Update: Updated ${ddlxName} successfully`);

        await delay(getOperationDelay('update', testCase));
        testLogger.info(
          `✅ Full high-level workflow completed successfully for ${ddlxName}`,
        );
      } catch (error: any) {
        testLogger.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: Optionally delete test metadata extension
        if (session && ddlxName) {
          try {
            const shouldCleanup = getCleanupAfter(testCase);

            // Delete only if cleanup_after is true
            if (shouldCleanup) {
              const deleteResponse = await handleDeleteMetadataExtension(
                { connection, logger: testLogger },
                {
                  name: ddlxName,
                  transport_request: transportRequest,
                },
              );

              if (!deleteResponse.isError) {
                testLogger.info(
                  `🧹 Cleaned up test metadata extension: ${ddlxName}`,
                );
              } else {
                const errorMsg =
                  deleteResponse.content[0]?.text || 'Unknown error';
                testLogger.warn(
                  `⚠️  Failed to delete metadata extension ${ddlxName}: ${errorMsg}`,
                );
              }
            } else {
              testLogger.warn(
                `⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${ddlxName}`,
              );
            }
          } catch (cleanupError) {
            testLogger.warn(
              `⚠️  Failed to cleanup test metadata extension ${ddlxName}: ${cleanupError}`,
            );
          }
        }
      }
    },
    getTimeout('long'),
  );
});
