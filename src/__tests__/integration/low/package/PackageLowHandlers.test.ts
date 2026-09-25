/**
 * Integration tests for Package Low-Level Handlers
 *
 * Tests the complete workflow using handler functions:
 * ValidatePackageLow → CreatePackageLow → DeletePackageLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/package
 */

import { handleCreatePackage } from '../../../../handlers/package/low/handleCreatePackage';
import { handleDeletePackage } from '../../../../handlers/package/low/handleDeletePackage';
import { handleValidatePackage } from '../../../../handlers/package/low/handleValidatePackage';
import { createAdtClient } from '../../../../lib/clients';
import { patchPackageXml } from '../../../../lib/strategies/packagePatch';
import { sequence } from '../../../../lib/strategies/sequence';
import { withLock } from '../../../../lib/strategies/withLock';
import { extractXmlString } from '../../../../lib/strategies/xmlPatch';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import {
  createHandlerContext,
  delay,
  extractErrorMessage,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

describe('Package Low-Level Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('package-low');

  beforeAll(async () => {
    tester = new LambdaTester(
      'create_package_low',
      'full_workflow',
      'package-low',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        // Basic setup
      },
      // Cleanup lambda
      async (context: LambdaTesterContext) => {
        const { connection, objectName, transportRequest } = context;
        if (!objectName) return;

        logger?.info(`   • cleanup: delete ${objectName}`);
        try {
          const deleteLogger = createTestLogger('package-low-delete');
          const deleteResponse = await tester.invokeToolOrHandler(
            'DeletePackageLow',
            {
              package_name: objectName,
              force_new_connection: true,
              ...(transportRequest && { transport_request: transportRequest }),
            },
            async () => {
              const deleteCtx = createHandlerContext({
                connection,
                logger: deleteLogger,
              });
              return handleDeletePackage(deleteCtx, {
                package_name: objectName,
                force_new_connection: true,
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
    'should execute full workflow: Validate → Create → Update description',
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

        // For packages: objectName = test_package (package to create),
        // packageName = parent package (super_package)
        const superPackage = packageName;
        const description =
          params.description || `Test package for low-level handler`;

        // Step 1: Validate
        logger?.info(`   • validate: ${objectName}`);
        const validateLogger = createTestLogger('package-low-validate');
        const validateResponse = await tester.invokeToolOrHandler(
          'ValidatePackageLow',
          {
            package_name: objectName,
            super_package: superPackage,
          },
          async () => {
            const validateCtx = createHandlerContext({
              connection,
              logger: validateLogger,
            });
            return handleValidatePackage(validateCtx, {
              package_name: objectName,
              super_package: superPackage,
            });
          },
        );

        if (validateResponse.isError) {
          const errorMsg = extractErrorMessage(validateResponse);
          const errorMsgLower = errorMsg.toLowerCase();
          if (
            errorMsgLower.includes('already exists') ||
            errorMsgLower.includes('does already exist')
          ) {
            logger?.info(
              `⏭️  Package ${objectName} already exists, skipping test`,
            );
            return;
          }
          throw new Error(`Validate failed: ${errorMsg}`);
        }

        const validateData = parseHandlerResponse(validateResponse);
        if (!validateData.validation_result?.valid) {
          const message = validateData.validation_result?.message || '';
          const messageLower = message.toLowerCase();
          if (
            validateData.validation_result?.exists ||
            messageLower.includes('already exists') ||
            messageLower.includes('does already exist')
          ) {
            logger?.info(
              `⏭️  Package ${objectName} already exists, skipping test`,
            );
            return;
          }
        }
        logger?.success(`✅ validate: ${objectName} completed`);

        const validateDelay = context.getOperationDelay('validate');
        await delay(validateDelay);

        // Step 2: Create
        logger?.info(`   • create: ${objectName}`);
        const createLogger = createTestLogger('package-low-create');
        const createArgs: Record<string, unknown> = {
          package_name: objectName,
          super_package: superPackage,
          description,
          package_type: params.package_type || 'development',
          ...(transportRequest && { transport_request: transportRequest }),
        };
        if (params.software_component) {
          createArgs.software_component = params.software_component;
        }
        if (params.transport_layer) {
          createArgs.transport_layer = params.transport_layer;
        }
        if (params.record_changes !== undefined) {
          createArgs.record_changes = params.record_changes;
        }

        const createResponse = await tester.invokeToolOrHandler(
          'CreatePackageLow',
          createArgs,
          async () => {
            const createCtx = createHandlerContext({
              connection,
              logger: createLogger,
            });
            return handleCreatePackage(createCtx, createArgs as any);
          },
        );

        if (createResponse.isError) {
          const errorMsg = extractErrorMessage(createResponse);
          const errorMsgLower = errorMsg.toLowerCase();
          if (
            errorMsgLower.includes('already exists') ||
            errorMsgLower.includes('does already exist')
          ) {
            logger?.info(
              `⏭️  Package ${objectName} already exists, skipping test`,
            );
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        // CreatePackageLow's terse projection is `terseWrite`: on success it
        // answers the literal text "SUCCESS", not a JSON object — `success`/
        // `package_name` no longer exist to read (CHANGELOG Unreleased: "Terse
        // writes answer the literal string `SUCCESS` ... uniformly across every
        // write tool"; see src/lib/strategies/projections.ts `terseWrite`).
        expect(createResponse.content[0]?.text).toBe('SUCCESS');
        logger?.success(`✅ create: ${objectName} completed`);

        const createDelay = context.getOperationDelay('create');
        await delay(createDelay);

        // Step 3: Update description. adt-clients 19: a package has no
        // source, only its own document (`updateMetadata`, not `update` —
        // IAdtCapabilities.ts), it takes the whole document rather than
        // merging (handleUpdatePackage.ts's own doc comment), and the lock
        // is the caller's — taken and released here since this test calls
        // the client directly rather than through LockPackage/UpdatePackage.
        const updatedDescription =
          params.updated_description || `${description} (UPDATED)`;
        logger?.info(`   • update description: ${objectName}`);
        const adtClient = createAdtClient(connection);
        const packageObj = adtClient.getPackage();
        const written = await withLock(
          () => packageObj.lock({ packageName: objectName }),
          (lockHandle) =>
            sequence(
              () => packageObj.readMetadata({ packageName: objectName }),
              (current) =>
                packageObj.updateMetadata(
                  {
                    packageName: objectName,
                    // A package on a request is written under that request:
                    // without it the PUT carries no corrNr and an on-premise
                    // system refuses it (400, E19 2026-09-25).
                    ...(transportRequest && { transportRequest }),
                  },
                  {
                    source: patchPackageXml(
                      extractXmlString(current, `package ${objectName}`),
                      { description: updatedDescription },
                    ),
                    lockHandle,
                  },
                ),
            ),
          (lockHandle) =>
            packageObj.unlock({ packageName: objectName }, lockHandle),
        );
        if (!written.ok) {
          throw new Error(`Update failed: ${written.getError().message}`);
        }
        logger?.success(`✅ update description: ${objectName} completed`);
      });
    },
    getTimeout('long'),
  );
});
