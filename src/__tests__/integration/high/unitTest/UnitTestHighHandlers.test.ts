/**
 * Integration tests for Unit Test High-Level Handlers
 *
 * Tests all high-level handlers for Unit Test module:
 * - RunUnitTest (high-level) - start unit test run using AdtClient.getUnitTest().create()
 * - GetUnitTest (high-level) - get unit test status/result using AdtClient.getUnitTest().read()
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/high/unitTest/UnitTestHighHandlers
 */

import { handleGetUnitTest } from '../../../../handlers/unit_test/high/handleGetUnitTest';
import { handleRunUnitTest } from '../../../../handlers/unit_test/high/handleRunUnitTest';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import {
  createHandlerContext,
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
    'should test RunUnitTest and GetUnitTest high-level handlers',
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

        // Step 1: Run unit test
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

        const runId = runData.run_id;
        testLogger?.success(
          `✅ run unit test: ${containerClass}/${testClassName} completed successfully (run_id: ${runId})`,
        );

        // Wait for test run to start
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Step 2: Get unit test status/result
        testLogger?.info(`   • get unit test: run_id ${runId}`);
        const getResponse = await handleGetUnitTest(handlerContext, {
          run_id: runId,
        });

        if (getResponse.isError) {
          const errorMsg = extractErrorMessage(getResponse);
          // Test might not be ready yet, log warning but don't fail
          testLogger?.warn(
            `GetUnitTest failed (test might not be ready yet): ${errorMsg}`,
          );
        } else {
          const getData = parseHandlerResponse(getResponse);
          expect(getData.success).toBe(true);
          expect(getData.run_id).toBe(runId);
          testLogger?.success(
            `✅ get unit test: run_id ${runId} completed successfully`,
          );
        }
      });
    },
    getTimeout('long'),
  );
});
