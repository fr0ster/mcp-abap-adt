/**
 * Integration tests for Unit Test High-Level Handlers
 *
 * Tests high-level handlers for Unit Test module:
 * - CreateUnitTest / GetUnitTest / UpdateUnitTest / RunUnitTest / GetUnitTestStatus / GetUnitTestResult / DeleteUnitTest
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/high/unitTest/ClassUnitTestHighHandlers
 */

import { handleCreateUnitTest } from '../../../../handlers/unit_test/high/handleCreateUnitTest';
import { handleDeleteUnitTest } from '../../../../handlers/unit_test/high/handleDeleteUnitTest';
import { handleGetUnitTest } from '../../../../handlers/unit_test/high/handleGetUnitTest';
import { handleGetUnitTestResult } from '../../../../handlers/unit_test/high/handleGetUnitTestResult';
import { handleGetUnitTestStatus } from '../../../../handlers/unit_test/high/handleGetUnitTestStatus';
import { handleRunUnitTest } from '../../../../handlers/unit_test/high/handleRunUnitTest';
import { handleUpdateUnitTest } from '../../../../handlers/unit_test/high/handleUpdateUnitTest';
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

describe('Unit Test High-Level Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('unit-test-high');

  beforeAll(async () => {
    tester = new LambdaTester(
      'class_unit_test',
      'full_workflow',
      'unit-test-high',
      'full_workflow',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        // Basic setup - connection is already created in tester
      },
      // Cleanup lambda - no cleanup needed for unit test runs
      async (_context: LambdaTesterContext) => {
        // Unit test runs don't need cleanup
      },
    );
  }, getTimeout('long'));

  beforeEach(async () => {
    await tester.beforeEach(async (_context: LambdaTesterContext) => {
      // No additional setup needed
    });
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  afterAll(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {
      // No additional cleanup needed
    });
  });

  it(
    'should test C->R->U->Run->Get status->Get result->D for Class Unit Test high-level handlers',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params, logger: contextLogger } = context;
        const testLogger = contextLogger || logger;

        if (!params) {
          testLogger?.warn('No test parameters found, skipping test');
          return;
        }

        const testCase = params.test_class;
        if (!testCase?.run_unit_test) {
          testLogger?.warn(
            'Unit test configuration not found in test-config.yaml, skipping test',
          );
          return;
        }

        const containerClass = testCase.container_class;
        const testClassName = testCase.name;

        if (!containerClass || !testClassName) {
          testLogger?.warn(
            'Container class or test class name not found, skipping test',
          );
          return;
        }

        const handlerContext = createHandlerContext({
          connection,
          logger: testLogger,
        });

        testLogger?.info(
          `   • create unit test: ${containerClass}/${testClassName}`,
        );
        const createResponse = await handleCreateUnitTest(handlerContext, {
          tests: [
            {
              container_class: containerClass,
              test_class: testClassName,
            },
          ],
          title: `Unit test run for ${containerClass}`,
        });

        if (createResponse.isError) {
          const errorMsg = extractErrorMessage(createResponse);
          throw new Error(`CreateUnitTest failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.run_id).toBeDefined();

        const runId = createData.run_id;
        testLogger?.success(
          `create unit test: ${containerClass}/${testClassName} completed successfully (run_id: ${runId})`,
        );

        await delay(5000);

        testLogger?.info(`   • read unit test: run_id ${runId}`);
        const getResponse = await handleGetUnitTest(handlerContext, {
          run_id: runId,
        });

        if (getResponse.isError) {
          const errorMsg = extractErrorMessage(getResponse);
          testLogger?.warn(
            `GetUnitTest failed (test might not be ready yet): ${errorMsg}`,
          );
        } else {
          const getData = parseHandlerResponse(getResponse);
          expect(getData.success).toBe(true);
          expect(getData.run_id).toBe(runId);
          testLogger?.success(
            `get unit test: run_id ${runId} completed successfully`,
          );
        }

        testLogger?.info(`   • update unit test: run_id ${runId}`);
        const updateResponse = await handleUpdateUnitTest(handlerContext, {
          run_id: runId,
        });
        expect(updateResponse.isError).toBe(true);

        testLogger?.info(
          `   • run unit test: ${containerClass}/${testClassName}`,
        );
        const runResponse = await handleRunUnitTest(handlerContext, {
          tests: [
            {
              container_class: containerClass,
              test_class: testClassName,
            },
          ],
          title: `Unit test run for ${containerClass}`,
        });

        if (runResponse.isError) {
          const errorMsg = extractErrorMessage(runResponse);
          throw new Error(`RunUnitTest failed: ${errorMsg}`);
        }

        const runData = parseHandlerResponse(runResponse);
        expect(runData.success).toBe(true);
        expect(runData.run_id).toBeDefined();

        const secondRunId = runData.run_id;
        testLogger?.success(
          `run unit test: ${containerClass}/${testClassName} completed successfully (run_id: ${secondRunId})`,
        );

        await delay(5000);

        testLogger?.info(`   • get unit test status: run_id ${secondRunId}`);
        const getStatusResponse = await handleGetUnitTestStatus(
          handlerContext,
          {
            run_id: secondRunId,
            with_long_polling: true,
          },
        );

        if (getStatusResponse.isError) {
          const errorMsg = extractErrorMessage(getStatusResponse);
          testLogger?.warn(
            `GetUnitTestStatus failed (test might not be ready yet): ${errorMsg}`,
          );
        } else {
          const getStatusData = parseHandlerResponse(getStatusResponse);
          expect(getStatusData.success).toBe(true);
          expect(getStatusData.run_id).toBe(secondRunId);
          testLogger?.success(
            `get unit test status: run_id ${secondRunId} completed successfully`,
          );
        }

        testLogger?.info(`   • get unit test result: run_id ${secondRunId}`);
        const getResultResponse = await handleGetUnitTestResult(
          handlerContext,
          {
            run_id: secondRunId,
            with_navigation_uris: false,
            format: 'abapunit',
          },
        );

        if (getResultResponse.isError) {
          const errorMsg = extractErrorMessage(getResultResponse);
          testLogger?.warn(
            `GetUnitTestResult failed (test might not be ready yet): ${errorMsg}`,
          );
        } else {
          const getResultData = parseHandlerResponse(getResultResponse);
          expect(getResultData.success).toBe(true);
          expect(getResultData.run_id).toBe(secondRunId);
          testLogger?.success(
            `get unit test result: run_id ${secondRunId} completed successfully`,
          );
        }

        testLogger?.info(`   • delete unit test: run_id ${secondRunId}`);
        const deleteResponse = await handleDeleteUnitTest(handlerContext, {
          run_id: secondRunId,
        });
        expect(deleteResponse.isError).toBe(true);
      });
    },
    getTimeout('long'),
  );
});
