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

import { handleCreateMetadataExtension } from '../../../../handlers/ddlx/high/handleCreateMetadataExtension';
import { handleUpdateMetadataExtension } from '../../../../handlers/ddlx/high/handleUpdateMetadataExtension';
import { handleDeleteMetadataExtension } from '../../../../handlers/metadata_extension/high/handleDeleteMetadataExtension';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import {
  createHandlerContext,
  extractErrorMessage,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

describe('MetadataExtension High-Level Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('metadata-extension-high');

  beforeAll(async () => {
    tester = new LambdaTester(
      'create_metadata_extension',
      'full_workflow',
      'metadata-extension-high',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        // Basic setup - connection is already created in tester
      },
      // Cleanup lambda - will be called by tester after checking YAML params
      async (context: LambdaTesterContext) => {
        const { connection, objectName, transportRequest } = context;
        if (!objectName) return;

        logger?.info(`   • cleanup: delete ${objectName}`);
        try {
          const deleteLogger = createTestLogger(
            'metadata-extension-high-delete',
          );
          const deleteResponse = await tester.invokeToolOrHandler(
            'DeleteMetadataExtension',
            {
              metadata_extension_name: objectName,
              ...(transportRequest && { transport_request: transportRequest }),
            },
            async () => {
              const deleteCtx = createHandlerContext({
                connection,
                logger: deleteLogger,
              });
              return handleDeleteMetadataExtension(deleteCtx, {
                metadata_extension_name: objectName,
                ...(transportRequest && {
                  transport_request: transportRequest,
                }),
              });
            },
          );
          if (deleteResponse.isError) {
            const errorMsg = extractErrorMessage(deleteResponse);
            logger?.warn(`Delete failed (ignored in cleanup): ${errorMsg}`);
          } else {
            logger?.success(`✅ cleanup: deleted ${objectName} successfully`);
          }
        } catch (error: any) {
          logger?.warn(
            `Cleanup delete error (ignored): ${error.message || String(error)}`,
          );
        }
      },
    );
  }, getTimeout('long'));

  afterAll(async () => {
    await tester.afterAll(async () => {});
  });

  beforeEach(async () => {
    await tester.beforeEach(async () => {});
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  it(
    'should test all MetadataExtension high-level handlers',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const {
          connection,
          objectName,
          params,
          packageName,
          transportRequest,
        } = context;

        expect(objectName).toBeDefined();
        expect(objectName).not.toBe('');
        if (!objectName) {
          throw new Error('objectName is required');
        }
        const ddlxName = objectName;

        const description =
          params.description ||
          `Test metadata extension for high-level handler`;

        // Step 1: Create
        logger?.info(`   • create: ${ddlxName}`);
        const createLogger = createTestLogger('metadata-extension-high-create');
        const createResponse = await tester.invokeToolOrHandler(
          'CreateMetadataExtension',
          {
            name: ddlxName,
            description,
            package_name: packageName,
            ...(transportRequest && { transport_request: transportRequest }),
            activate: true,
          },
          async () => {
            const createCtx = createHandlerContext({
              connection,
              logger: createLogger,
            });
            return handleCreateMetadataExtension(createCtx, {
              name: ddlxName,
              description,
              package_name: packageName,
              transport_request: transportRequest,
              activate: true,
            });
          },
        );

        if (createResponse.isError) {
          const errorMsg = extractErrorMessage(createResponse);
          const errorMsgLower = errorMsg.toLowerCase();
          if (
            errorMsgLower.includes('already exists') ||
            errorMsgLower.includes('does already exist') ||
            errorMsgLower.includes('resourcealreadyexists')
          ) {
            // Try to delete and retry
            logger?.warn(
              `⚠️  MetadataExtension ${ddlxName} appears to exist, attempting cleanup...`,
            );
            try {
              const retryDeleteLogger = createTestLogger(
                'metadata-extension-high-retry-delete',
              );
              await tester.invokeToolOrHandler(
                'DeleteMetadataExtension',
                {
                  metadata_extension_name: ddlxName,
                  ...(transportRequest && {
                    transport_request: transportRequest,
                  }),
                },
                async () => {
                  const deleteCtx = createHandlerContext({
                    connection,
                    logger: retryDeleteLogger,
                  });
                  return handleDeleteMetadataExtension(deleteCtx, {
                    metadata_extension_name: ddlxName,
                    ...(transportRequest && {
                      transport_request: transportRequest,
                    }),
                  });
                },
              );
              logger?.info(
                `🧹 Cleaned up existing metadata extension ${ddlxName}, but skipping retry for safety`,
              );
            } catch (deleteError: any) {
              logger?.info(
                `⏭️  High Create failed for ${ddlxName}: couldn't cleanup existing object`,
              );
            }
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.name).toBe(ddlxName);
        logger?.success(`✅ create: ${ddlxName} completed successfully`);

        // Wait after creation
        const createDelay = context.getOperationDelay('create');
        logger?.info(
          `   • waiting ${createDelay}ms after creation before update...`,
        );
        await new Promise((resolve) => setTimeout(resolve, createDelay));

        // Step 2: Update
        logger?.info(`   • update: ${ddlxName}`);
        const updateLogger = createTestLogger('metadata-extension-high-update');
        const updatedSourceCode =
          params.update_source_code ||
          `@Metadata.layer: #CORE
annotate view ZI_TEST_ENTITY with {
  @EndUserText.label: '${description} (updated)'
  @UI.hidden: true
  field1;
}`;

        const updateResponse = await tester.invokeToolOrHandler(
          'UpdateMetadataExtension',
          {
            name: ddlxName,
            source_code: updatedSourceCode,
            ...(transportRequest && { transport_request: transportRequest }),
            activate: true,
          },
          async () => {
            const updateCtx = createHandlerContext({
              connection,
              logger: updateLogger,
            });
            return handleUpdateMetadataExtension(updateCtx, {
              name: ddlxName,
              source_code: updatedSourceCode,
              activate: true,
            });
          },
        );

        if (updateResponse.isError) {
          const errorMsg = extractErrorMessage(updateResponse);
          throw new Error(`Update failed: ${errorMsg}`);
        }

        const updateData = parseHandlerResponse(updateResponse);
        expect(updateData.success).toBe(true);
        expect(updateData.name).toBe(ddlxName);
        logger?.success(`✅ update: ${ddlxName} completed successfully`);
      });
    },
    getTimeout('long'),
  );
});
