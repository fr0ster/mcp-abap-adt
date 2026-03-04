/**
 * Integration tests for Package Low-Level Handlers
 *
 * Tests the complete workflow using handler functions:
 * ValidatePackageLow → CreatePackageLow → LockPackageLow →
 * UnlockPackageLow → DeletePackageLow
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
import { handleValidatePackage } from '../../../../handlers/package/low/handleValidatePackage';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import {
  createHandlerContext,
  delay,
  extractErrorMessage,
  extractLockHandle,
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
              ...(transportRequest && { transport_request: transportRequest }),
            },
            async () => {
              const deleteCtx = createHandlerContext({
                connection,
                logger: deleteLogger,
              });
              return handleDeletePackage(deleteCtx, {
                package_name: objectName,
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

  afterEach(async () => {
    await tester.afterEach();
  });

  it(
    'should execute full workflow: Validate → Create → Lock → Unlock',
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

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.package_name).toBe(objectName);
        logger?.success(`✅ create: ${objectName} completed`);

        const createDelay = context.getOperationDelay('create');
        await delay(createDelay);

        // Step 3: Lock
        logger?.info(`   • lock: ${objectName}`);
        const lockLogger = createTestLogger('package-low-lock');
        const lockResponse = await tester.invokeToolOrHandler(
          'LockPackageLow',
          {
            package_name: objectName,
            super_package: superPackage || '',
          },
          async () => {
            const lockCtx = createHandlerContext({
              connection,
              logger: lockLogger,
            });
            return handleLockPackage(lockCtx, {
              package_name: objectName,
              super_package: superPackage || '',
            });
          },
        );

        if (lockResponse.isError) {
          const errorMsg = extractErrorMessage(lockResponse);
          throw new Error(`Lock failed: ${errorMsg}`);
        }

        const lockData = parseHandlerResponse(lockResponse);
        const lockHandle = extractLockHandle(lockData);
        const sessionId = lockData.session_id;
        logger?.success(`✅ lock: ${objectName} completed`);

        const lockDelay = context.getOperationDelay('lock');
        await delay(lockDelay);

        // Step 4: Unlock
        logger?.info(`   • unlock: ${objectName}`);
        const unlockLogger = createTestLogger('package-low-unlock');
        const unlockResponse = await tester.invokeToolOrHandler(
          'UnlockPackageLow',
          {
            package_name: objectName,
            super_package: superPackage,
            lock_handle: lockHandle,
            session_id: sessionId,
          },
          async () => {
            const unlockCtx = createHandlerContext({
              connection,
              logger: unlockLogger,
            });
            return handleUnlockPackage(unlockCtx, {
              package_name: objectName,
              super_package: superPackage,
              lock_handle: lockHandle,
              session_id: sessionId,
            });
          },
        );

        if (unlockResponse.isError) {
          const errorMsg = extractErrorMessage(unlockResponse);
          throw new Error(`Unlock failed: ${errorMsg}`);
        }

        const unlockData = parseHandlerResponse(unlockResponse);
        expect(unlockData.success).toBe(true);
        logger?.success(`✅ unlock: ${objectName} completed`);
      });
    },
    getTimeout('long'),
  );
});
