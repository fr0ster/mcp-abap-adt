/**
 * Integration tests for Package Low-Level Handlers
 *
 * Tests the complete workflow using handler functions:
 * ValidatePackageLow → CreatePackageLow → (LockPackageLow → UpdatePackageLow →
 * UnlockPackageLow) twice → DeletePackageLow
 *
 * Every call goes on the tester's one connection, as it does in the server. A
 * package created or updated in an ABAP session cannot be changed again by
 * that session — PAK/058, `CL_PACKAGE`'s instance buffer
 * (docs/installation/RFC_SETUP.md). Over RFC, where one connection is one
 * session, the handlers take care of it (lib/packageSessions.ts): the create
 * and each lock → update → unlock chain run in sessions of their own. Two
 * updates in a row are what shows it — the second was refused before.
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
import { handleLockPackage } from '../../../../handlers/package/low/handleLockPackage';
import { handleUnlockPackage } from '../../../../handlers/package/low/handleUnlockPackage';
import { handleUpdatePackage } from '../../../../handlers/package/low/handleUpdatePackage';
import { handleValidatePackage } from '../../../../handlers/package/low/handleValidatePackage';
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

        // Step 3: Update description twice, through the tools, on the one
        // connection. The second update is the one PAK/058 used to refuse:
        // the first update's save leaves the package changeable in its
        // session's buffer.
        const updatedDescription =
          params.updated_description || `${description} (UPDATED)`;
        for (const round of [1, 2]) {
          const roundDescription = `${updatedDescription} ${round}`;
          logger?.info(`   • update description (${round}): ${objectName}`);
          const toolLogger = createTestLogger('package-low-update');
          const ctx = createHandlerContext({ connection, logger: toolLogger });

          const lockResponse = await tester.invokeToolOrHandler(
            'LockPackageLow',
            { package_name: objectName, super_package: superPackage },
            async () =>
              handleLockPackage(ctx, {
                package_name: objectName,
                super_package: superPackage,
              }),
          );
          if (lockResponse.isError) {
            throw new Error(
              `Lock (${round}) failed: ${extractErrorMessage(lockResponse)}`,
            );
          }
          const lockData = parseHandlerResponse(lockResponse);
          const lockHandle: string = lockData.lock_handle;
          expect(lockHandle).toBeTruthy();

          let updateError: string | undefined;
          try {
            const updateArgs = {
              package_name: objectName,
              super_package: superPackage,
              updated_description: roundDescription,
              lock_handle: lockHandle,
              ...(transportRequest && { transport_request: transportRequest }),
            };
            const updateResponse = await tester.invokeToolOrHandler(
              'UpdatePackageLow',
              updateArgs,
              async () => handleUpdatePackage(ctx, updateArgs as any),
            );
            if (updateResponse.isError) {
              updateError = extractErrorMessage(updateResponse);
            }
          } finally {
            // Always released, whatever the update answered.
            const unlockArgs = {
              package_name: objectName,
              super_package: superPackage,
              lock_handle: lockHandle,
              session_id: lockData.session_id || 'package-low',
            };
            const unlockResponse = await tester.invokeToolOrHandler(
              'UnlockPackageLow',
              unlockArgs,
              async () => handleUnlockPackage(ctx, unlockArgs),
            );
            if (unlockResponse.isError) {
              logger?.warn(
                `Unlock (${round}) failed: ${extractErrorMessage(unlockResponse)}`,
              );
            }
          }
          if (updateError) {
            throw new Error(`Update (${round}) failed: ${updateError}`);
          }
          logger?.success(
            `✅ update description (${round}): ${objectName} completed`,
          );
        }
      });
    },
    getTimeout('long'),
  );
});
