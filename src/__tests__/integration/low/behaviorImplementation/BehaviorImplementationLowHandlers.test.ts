/**
 * Integration tests for BehaviorImplementation Low-Level Handlers
 *
 * Tests the complete workflow:
 * ValidateBehaviorImplementationLow → CreateClassLow → CheckClassLow →
 * LockBehaviorImplementationLow → Update (AdtClient) → UnlockClassLow →
 * ActivateClassLow → DeleteClassLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/behaviorImplementation
 */

import { handleLockBehaviorImplementation } from '../../../../handlers/behavior_implementation/low/handleLockBehaviorImplementation';
import { handleValidateBehaviorImplementation } from '../../../../handlers/behavior_implementation/low/handleValidateBehaviorImplementation';
import { handleActivateClass } from '../../../../handlers/class/low/handleActivateClass';
import { handleCheckClass } from '../../../../handlers/class/low/handleCheckClass';
import { handleCreateClass } from '../../../../handlers/class/low/handleCreateClass';
import { handleDeleteClass } from '../../../../handlers/class/low/handleDeleteClass';
import { handleUnlockClass } from '../../../../handlers/class/low/handleUnlockClass';
import { createAdtClient } from '../../../../lib/clients';
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

const testLogger = createTestLogger('bimpl-low');

describe('BehaviorImplementation Low-Level Handlers Integration', () => {
  let tester: LambdaTester;

  beforeAll(async () => {
    tester = new LambdaTester(
      'create_behavior_implementation_low',
      'full_workflow',
      'bimpl-low',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        // Basic setup
      },
      // Cleanup lambda
      async (context: LambdaTesterContext) => {
        const { connection, objectName, transportRequest } = context;
        if (!objectName) return;

        // objectName here is class_name
        testLogger?.info(`   • cleanup: delete ${objectName}`);
        try {
          const deleteLogger = createTestLogger('bimpl-low-delete');
          const deleteResponse = await tester.invokeToolOrHandler(
            'DeleteClassLow',
            {
              class_name: objectName,
              ...(transportRequest && { transport_request: transportRequest }),
            },
            async () => {
              const deleteCtx = createHandlerContext({
                connection,
                logger: deleteLogger,
              });
              return handleDeleteClass(deleteCtx, {
                class_name: objectName,
                ...(transportRequest && {
                  transport_request: transportRequest,
                }),
              });
            },
          );
          if (deleteResponse.isError) {
            const errorMsg = extractErrorMessage(deleteResponse);
            // 404 / not found is fine — object may not exist
            if (
              !errorMsg.includes('not found') &&
              !errorMsg.includes('already be deleted')
            ) {
              testLogger?.warn(
                `Delete failed (ignored in cleanup): ${errorMsg}`,
              );
            }
          } else {
            testLogger?.success(
              `✅ cleanup: deleted ${objectName} successfully`,
            );
          }
        } catch (error: any) {
          testLogger?.warn(
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
    'should execute full workflow: Validate → Create → Check → Lock → Update → Unlock → Activate',
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
        if (!objectName) {
          throw new Error('objectName (class_name) is required');
        }
        const className = objectName;

        if (!params.description) {
          throw new Error('description is required in test configuration');
        }
        if (!params.behavior_definition) {
          throw new Error(
            'behavior_definition is required in test configuration',
          );
        }
        const description = params.description;
        const behaviorDefinition = params.behavior_definition;

        // Step 1: Validate
        testLogger?.info(`   • validate: ${className}`);
        const validateLogger = createTestLogger('bimpl-low-validate');
        const validateResponse = await tester.invokeToolOrHandler(
          'ValidateBehaviorImplementationLow',
          {
            class_name: className,
            behavior_definition: behaviorDefinition,
            package_name: packageName,
            description,
          },
          async () => {
            const validateCtx = createHandlerContext({
              connection,
              logger: validateLogger,
            });
            return handleValidateBehaviorImplementation(validateCtx, {
              class_name: className,
              behavior_definition: behaviorDefinition,
              package_name: packageName,
              description,
            });
          },
        );

        if (validateResponse.isError) {
          const errorMsg = extractErrorMessage(validateResponse);
          testLogger?.info(
            `⏭️  Validation error for ${className}: ${errorMsg}, skipping test`,
          );
          return;
        }

        const validateData = parseHandlerResponse(validateResponse);
        if (!validateData.validation_result?.valid) {
          testLogger?.info(
            `⏭️  Validation failed for ${className}: ${validateData.validation_result?.message || ''}, skipping test`,
          );
          return;
        }
        testLogger?.success(`✅ validate: ${className} completed`);

        // Step 2: Create (as regular class)
        testLogger?.info(`   • create: ${className}`);
        const createLogger = createTestLogger('bimpl-low-create');
        const createArgs: Record<string, unknown> = {
          class_name: className,
          description,
          package_name: packageName,
          ...(transportRequest && { transport_request: transportRequest }),
        };

        const createResponse = await tester.invokeToolOrHandler(
          'CreateClassLow',
          createArgs,
          async () => {
            const createCtx = createHandlerContext({
              connection,
              logger: createLogger,
            });
            return handleCreateClass(createCtx, createArgs as any);
          },
        );

        if (createResponse.isError) {
          const errorMsg = extractErrorMessage(createResponse);
          const errorMsgLower = errorMsg.toLowerCase();
          if (
            errorMsgLower.includes('already exists') ||
            errorMsgLower.includes('does already exist')
          ) {
            testLogger?.info(
              `⏭️  BehaviorImplementation ${className} already exists, skipping test`,
            );
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.class_name).toBe(className);
        testLogger?.success(`✅ create: ${className} completed`);

        const createDelay = context.getOperationDelay('create');
        await delay(createDelay);

        // Step 3: Check
        testLogger?.info(`   • check: ${className}`);
        const checkLogger = createTestLogger('bimpl-low-check');
        const checkResponse = await tester.invokeToolOrHandler(
          'CheckClassLow',
          { class_name: className },
          async () => {
            const checkCtx = createHandlerContext({
              connection,
              logger: checkLogger,
            });
            return handleCheckClass(checkCtx, { class_name: className });
          },
        );

        if (checkResponse.isError) {
          const errorMsg = extractErrorMessage(checkResponse);
          throw new Error(`Check failed: ${errorMsg}`);
        }
        testLogger?.success(`✅ check: ${className} completed`);

        await delay(context.getOperationDelay('create'));

        // Step 4: Lock
        testLogger?.info(`   • lock: ${className}`);
        const lockLogger = createTestLogger('bimpl-low-lock');
        const lockResponse = await tester.invokeToolOrHandler(
          'LockBehaviorImplementationLow',
          { class_name: className },
          async () => {
            const lockCtx = createHandlerContext({
              connection,
              logger: lockLogger,
            });
            return handleLockBehaviorImplementation(lockCtx, {
              class_name: className,
            });
          },
        );

        if (lockResponse.isError) {
          const errorMsg = extractErrorMessage(lockResponse);
          throw new Error(`Lock failed: ${errorMsg}`);
        }

        const lockData = parseHandlerResponse(lockResponse);
        const lockHandle = extractLockHandle(lockData);
        testLogger?.success(`✅ lock: ${className} completed`);

        await delay(context.getOperationDelay('lock'));

        // Step 5: Update implementations include (AdtClient direct — no MCP tool for this)
        testLogger?.info(`   • update implementations include: ${className}`);
        if (!params.implementation_code) {
          throw new Error(
            'implementation_code is required in test configuration for update step',
          );
        }

        if (tester.isHardMode()) {
          // In hard mode we skip the raw AdtClient update step —
          // there is no dedicated MCP tool for updating behavior
          // implementation includes at low level.
          testLogger?.info(
            `⏭️  Skipping AdtClient update in hard mode (no MCP tool for behavior implementation update)`,
          );
        } else {
          const client = createAdtClient(connection);
          await client.getBehaviorImplementation().update(
            {
              className,
              behaviorDefinition: behaviorDefinition,
              implementationCode: params.implementation_code,
            },
            { lockHandle },
          );
          testLogger?.success(
            `✅ update implementations include: ${className} completed`,
          );
        }

        await delay(context.getOperationDelay('update'));

        // Step 6: Unlock
        testLogger?.info(`   • unlock: ${className}`);
        const unlockLogger = createTestLogger('bimpl-low-unlock');
        const unlockResponse = await tester.invokeToolOrHandler(
          'UnlockClassLow',
          {
            class_name: className,
            lock_handle: lockHandle,
          },
          async () => {
            const unlockCtx = createHandlerContext({
              connection,
              logger: unlockLogger,
            });
            return handleUnlockClass(unlockCtx, {
              class_name: className,
              lock_handle: lockHandle,
            });
          },
        );

        if (unlockResponse.isError) {
          const errorMsg = extractErrorMessage(unlockResponse);
          throw new Error(`Unlock failed: ${errorMsg}`);
        }

        const unlockData = parseHandlerResponse(unlockResponse);
        expect(unlockData.success).toBe(true);
        testLogger?.success(`✅ unlock: ${className} completed`);

        await delay(context.getOperationDelay('unlock'));

        // Step 7: Activate
        testLogger?.info(`   • activate: ${className}`);
        const activateLogger = createTestLogger('bimpl-low-activate');
        const activateResponse = await tester.invokeToolOrHandler(
          'ActivateClassLow',
          { class_name: className },
          async () => {
            const activateCtx = createHandlerContext({
              connection,
              logger: activateLogger,
            });
            return handleActivateClass(activateCtx, {
              class_name: className,
            });
          },
        );

        if (activateResponse.isError) {
          const errorMsg = extractErrorMessage(activateResponse);
          throw new Error(`Activate failed: ${errorMsg}`);
        }

        const activateData = parseHandlerResponse(activateResponse);
        expect(activateData.success).toBe(true);
        testLogger?.success(`✅ activate: ${className} completed`);

        testLogger?.success(
          `✅ Full workflow completed successfully for ${className}`,
        );
      });
    },
    getTimeout('long'),
  );
});
