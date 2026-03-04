/**
 * Integration tests for Class Unit Test Handlers
 *
 * Tests all low-level handlers for Class Unit Tests:
 * - LockClassTestClassesLow - Lock test classes include
 * - UpdateClassTestClassesLow - Update test classes include
 * - UnlockClassTestClassesLow - Unlock test classes include
 * - ActivateClassTestClassesLow - Activate test classes include
 * - RunClassUnitTestsLow - Run ABAP Unit tests
 * - GetClassUnitTestStatusLow - Get test run status
 * - GetClassUnitTestResultLow - Get test run result
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/unitTest/ClassUnitTestHandlers
 */

import { handleActivateClassTestClasses } from '../../../../handlers/class/low/handleActivateClassTestClasses';
import { handleGetClassUnitTestResult } from '../../../../handlers/class/low/handleGetClassUnitTestResult';
import { handleGetClassUnitTestStatus } from '../../../../handlers/class/low/handleGetClassUnitTestStatus';
import { handleLockClassTestClasses } from '../../../../handlers/class/low/handleLockClassTestClasses';
import { handleRunClassUnitTests } from '../../../../handlers/class/low/handleRunClassUnitTests';
import { handleUnlockClassTestClasses } from '../../../../handlers/class/low/handleUnlockClassTestClasses';
import { handleUpdateClassTestClasses } from '../../../../handlers/class/low/handleUpdateClassTestClasses';
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

const testLogger = createTestLogger('class-unittest');

describe('Class Unit Test Handlers Integration', () => {
  let tester: LambdaTester;

  beforeAll(async () => {
    tester = new LambdaTester(
      'class_unit_test',
      'full_workflow',
      'class-unittest',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        // Basic setup
      },
      // Cleanup lambda — unit tests don't delete objects, only unlock if needed
      async (context: LambdaTesterContext) => {
        const { objectName } = context;
        if (!objectName) return;
        // No deletion for unit test objects — they are existing classes
        testLogger?.info(
          `⚠️ Cleanup: no deletion for unit test container ${objectName}`,
        );
      },
    );
  }, getTimeout('long'));

  afterEach(async () => {
    await tester.afterEach();
  });

  it(
    'should execute full workflow: Lock → Update → Unlock → Activate → Run → GetStatus → GetResult',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;

        const containerClassName = params.container_class_name;
        const testClassName = params.test_class_name;

        if (!containerClassName || !testClassName) {
          testLogger?.info(
            '⏭️  Skipping test: container_class_name or test_class_name not configured',
          );
          return;
        }

        const testClassSource =
          params.test_class_source ||
          `CLASS ${testClassName} DEFINITION FINAL
  FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.

  PRIVATE SECTION.
    METHODS test_method FOR TESTING.
ENDCLASS.

CLASS ${testClassName} IMPLEMENTATION.
  METHOD test_method.
    cl_abap_unit_assert=>assert_true( abap_true ).
  ENDMETHOD.
ENDCLASS.`;

        let testClassesLockHandle: string | null = null;
        let testClassesLocked = false;

        try {
          // Step 1: Lock test classes
          testLogger?.info(`   • lock test classes: ${containerClassName}`);
          const lockLogger = createTestLogger('class-unittest-lock');
          const lockResponse = await tester.invokeToolOrHandler(
            'LockClassTestClassesLow',
            { class_name: containerClassName },
            async () => {
              const lockCtx = createHandlerContext({
                connection,
                logger: lockLogger,
              });
              return handleLockClassTestClasses(lockCtx, {
                class_name: containerClassName,
              });
            },
          );

          if (lockResponse.isError) {
            const errorMsg = extractErrorMessage(lockResponse);
            throw new Error(`Lock test classes failed: ${errorMsg}`);
          }

          const lockData = parseHandlerResponse(lockResponse);
          testClassesLockHandle = lockData.test_classes_lock_handle;
          testClassesLocked = true;
          expect(testClassesLockHandle).toBeDefined();
          testLogger?.success(
            `✅ lock test classes: ${containerClassName} completed`,
          );

          await delay(context.getOperationDelay('lock'));

          // Step 2: Update test classes
          testLogger?.info(`   • update test classes: ${containerClassName}`);
          const updateLogger = createTestLogger('class-unittest-update');
          const updateResponse = await tester.invokeToolOrHandler(
            'UpdateClassTestClassesLow',
            {
              class_name: containerClassName,
              test_class_source: testClassSource,
              lock_handle: testClassesLockHandle!,
            },
            async () => {
              const updateCtx = createHandlerContext({
                connection,
                logger: updateLogger,
              });
              return handleUpdateClassTestClasses(updateCtx, {
                class_name: containerClassName,
                test_class_source: testClassSource,
                lock_handle: testClassesLockHandle!,
              });
            },
          );

          if (updateResponse.isError) {
            const errorMsg = extractErrorMessage(updateResponse);
            throw new Error(`Update test classes failed: ${errorMsg}`);
          }

          const updateData = parseHandlerResponse(updateResponse);
          expect(updateData.success).toBe(true);
          testLogger?.success(
            `✅ update test classes: ${containerClassName} completed`,
          );

          await delay(context.getOperationDelay('update'));

          // Step 3: Unlock test classes
          testLogger?.info(`   • unlock test classes: ${containerClassName}`);
          const unlockLogger = createTestLogger('class-unittest-unlock');
          const unlockResponse = await tester.invokeToolOrHandler(
            'UnlockClassTestClassesLow',
            {
              class_name: containerClassName,
              lock_handle: testClassesLockHandle!,
            },
            async () => {
              const unlockCtx = createHandlerContext({
                connection,
                logger: unlockLogger,
              });
              return handleUnlockClassTestClasses(unlockCtx, {
                class_name: containerClassName,
                lock_handle: testClassesLockHandle!,
              });
            },
          );

          if (unlockResponse.isError) {
            const errorMsg = extractErrorMessage(unlockResponse);
            throw new Error(`Unlock test classes failed: ${errorMsg}`);
          }

          const unlockData = parseHandlerResponse(unlockResponse);
          expect(unlockData.success).toBe(true);
          testClassesLocked = false;
          testLogger?.success(
            `✅ unlock test classes: ${containerClassName} completed`,
          );

          await delay(context.getOperationDelay('unlock'));

          // Step 4: Activate test classes
          testLogger?.info(`   • activate test classes: ${containerClassName}`);
          const activateLogger = createTestLogger('class-unittest-activate');
          const activateResponse = await tester.invokeToolOrHandler(
            'ActivateClassTestClassesLow',
            {
              class_name: containerClassName,
              test_class_name: testClassName,
            },
            async () => {
              const activateCtx = createHandlerContext({
                connection,
                logger: activateLogger,
              });
              return handleActivateClassTestClasses(activateCtx, {
                class_name: containerClassName,
                test_class_name: testClassName,
              });
            },
          );

          if (activateResponse.isError) {
            const errorMsg = extractErrorMessage(activateResponse);
            throw new Error(`Activate test classes failed: ${errorMsg}`);
          }

          const activateData = parseHandlerResponse(activateResponse);
          expect(activateData.success).toBe(true);
          testLogger?.success(
            `✅ activate test classes: ${containerClassName} completed`,
          );

          await delay(context.getOperationDelay('activate'));

          // Step 5: Run unit tests
          testLogger?.info(`   • run unit tests: ${containerClassName}`);
          const runLogger = createTestLogger('class-unittest-run');
          const runResponse = await tester.invokeToolOrHandler(
            'RunClassUnitTestsLow',
            {
              tests: [
                {
                  container_class: containerClassName,
                  test_class: testClassName,
                },
              ],
              title: `Unit test run for ${containerClassName}`,
            },
            async () => {
              const runCtx = createHandlerContext({
                connection,
                logger: runLogger,
              });
              return handleRunClassUnitTests(runCtx, {
                tests: [
                  {
                    container_class: containerClassName,
                    test_class: testClassName,
                  },
                ],
                title: `Unit test run for ${containerClassName}`,
              });
            },
          );

          if (runResponse.isError) {
            const errorMsg = extractErrorMessage(runResponse);
            throw new Error(`Run unit tests failed: ${errorMsg}`);
          }

          const runData = parseHandlerResponse(runResponse);
          const runId = runData.run_id;
          expect(runData.success).toBe(true);
          expect(runId).toBeDefined();
          testLogger?.success(
            `✅ run unit tests: ${containerClassName} completed (run_id: ${runId})`,
          );

          // Wait for test run to complete
          await delay(5000);

          // Step 6: Get test run status
          if (runId) {
            testLogger?.info(`   • get test status: run_id=${runId}`);
            const statusLogger = createTestLogger('class-unittest-status');
            const statusResponse = await tester.invokeToolOrHandler(
              'GetClassUnitTestStatusLow',
              { run_id: runId },
              async () => {
                const statusCtx = createHandlerContext({
                  connection,
                  logger: statusLogger,
                });
                return handleGetClassUnitTestStatus(statusCtx, {
                  run_id: runId,
                });
              },
            );

            if (!statusResponse.isError) {
              testLogger?.success(`✅ get test status completed`);
            } else {
              testLogger?.warn(`⚠️  get test status failed (non-critical)`);
            }
          }

          // Step 7: Get test run result
          if (runId) {
            await delay(10000);

            testLogger?.info(`   • get test result: run_id=${runId}`);
            const resultLogger = createTestLogger('class-unittest-result');
            const resultResponse = await tester.invokeToolOrHandler(
              'GetClassUnitTestResultLow',
              { run_id: runId },
              async () => {
                const resultCtx = createHandlerContext({
                  connection,
                  logger: resultLogger,
                });
                return handleGetClassUnitTestResult(resultCtx, {
                  run_id: runId,
                });
              },
            );

            if (!resultResponse.isError) {
              testLogger?.success(`✅ get test result completed`);
            } else {
              testLogger?.warn(`⚠️  get test result failed (non-critical)`);
            }
          }

          testLogger?.success(
            `✅ Full unit test workflow completed for ${containerClassName}`,
          );
        } catch (error: any) {
          // Emergency unlock if still locked
          if (testClassesLocked && testClassesLockHandle) {
            try {
              testLogger?.info(`   • emergency unlock: ${containerClassName}`);
              const emergencyUnlockLogger = createTestLogger(
                'class-unittest-emergency-unlock',
              );
              await tester.invokeToolOrHandler(
                'UnlockClassTestClassesLow',
                {
                  class_name: containerClassName,
                  lock_handle: testClassesLockHandle,
                },
                async () => {
                  const unlockCtx = createHandlerContext({
                    connection,
                    logger: emergencyUnlockLogger,
                  });
                  return handleUnlockClassTestClasses(unlockCtx, {
                    class_name: containerClassName,
                    lock_handle: testClassesLockHandle!,
                  });
                },
              );
              testLogger?.info(`   • emergency unlock completed`);
            } catch (unlockError: any) {
              testLogger?.warn(
                `⚠️  Emergency unlock failed: ${unlockError.message}`,
              );
            }
          }
          throw error;
        }
      });
    },
    getTimeout('long'),
  );
});
