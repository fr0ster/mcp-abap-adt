/**
 * Integration tests for CDS Unit Test High-Level Handlers
 *
 * Tests CDS unit test class lifecycle and run status/result retrieval:
 * - CreateCdsUnitTest / UpdateCdsUnitTest / RunUnitTest / GetCdsUnitTestStatus / GetCdsUnitTestResult / DeleteCdsUnitTest
 */

import { handleGetClass } from '../../../../handlers/class/high/handleGetClass';
import { handleCreateCdsUnitTest } from '../../../../handlers/unit_test/high/handleCreateCdsUnitTest';
import { handleDeleteCdsUnitTest } from '../../../../handlers/unit_test/high/handleDeleteCdsUnitTest';
import { handleGetCdsUnitTestResult } from '../../../../handlers/unit_test/high/handleGetCdsUnitTestResult';
import { handleGetCdsUnitTestStatus } from '../../../../handlers/unit_test/high/handleGetCdsUnitTestStatus';
import { handleRunUnitTest } from '../../../../handlers/unit_test/high/handleRunUnitTest';
import { handleUpdateCdsUnitTest } from '../../../../handlers/unit_test/high/handleUpdateCdsUnitTest';
import { getCleanupAfter, getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import {
  createHandlerContext,
  delay,
  extractErrorMessage,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

describe('CDS Unit Test High-Level Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('cds-unit-test-high');
  let deletedInTest = false;

  beforeAll(async () => {
    tester = new LambdaTester(
      'cds_unit_test',
      'full_workflow',
      'cds-unit-test-high',
      'full_workflow',
    );

    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        // No additional setup needed
      },
      async (context: LambdaTesterContext) => {
        if (deletedInTest) {
          return;
        }

        const {
          connection,
          params,
          logger: contextLogger,
          transportRequest,
        } = context;
        const testLogger = contextLogger || logger;

        const className = params?.class_name;
        if (!className) {
          return;
        }

        const handlerContext = createHandlerContext({
          connection,
          logger: testLogger,
        });

        try {
          const deleteResponse = await handleDeleteCdsUnitTest(handlerContext, {
            class_name: className,
            transport_request: params?.transport_request || transportRequest,
          });

          if (deleteResponse.isError) {
            const errorMsg = extractErrorMessage(deleteResponse);
            testLogger?.warn(
              `Cleanup delete failed (ignored): ${errorMsg || 'Unknown error'}`,
            );
          } else {
            testLogger?.info(`cleanup: deleted ${className} successfully`);
          }
        } catch (error: any) {
          testLogger?.warn(
            `Cleanup delete error (ignored): ${error?.message || String(error)}`,
          );
        }
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
    'should test C->R->U->Run->Get status->Get result->D for CDS unit test high-level handlers',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params, logger: contextLogger, testCase } = context;
        const testLogger = contextLogger || logger;

        if (!params) {
          testLogger?.warn('No test parameters found, skipping test');
          return;
        }

        const className = params.class_name;
        const packageName = params.package_name;
        const cdsViewName = params.cds_view_name;
        const classTemplate = params.class_template;
        const testClassSource = params.test_class_source;
        const testClassName = params.test_class_name;
        const updateTestClassSource = params.update_test_class_source;

        if (
          !className ||
          !packageName ||
          !cdsViewName ||
          !classTemplate ||
          !testClassSource ||
          !testClassName
        ) {
          testLogger?.warn(
            'CDS unit test configuration not found in test-config.yaml, skipping test',
          );
          return;
        }

        const handlerContext = createHandlerContext({
          connection,
          logger: testLogger,
        });

        // Step 1: Create CDS unit test class
        testLogger?.info(`   • create cds unit test: ${className}`);
        const createResponse = await handleCreateCdsUnitTest(handlerContext, {
          class_name: className,
          package_name: packageName,
          cds_view_name: cdsViewName,
          class_template: classTemplate,
          test_class_source: testClassSource,
          description: params.description,
          transport_request: params.transport_request,
        });

        if (createResponse.isError) {
          const errorMsg = extractErrorMessage(createResponse);
          throw new Error(`CreateCdsUnitTest failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.class_name).toBe(className.toUpperCase());

        testLogger?.success(`create cds unit test: ${className} done`);

        // Step 2: Read CDS unit test class (via GetClass)
        testLogger?.info(`   • read cds unit test class: ${className}`);
        const readResponse = await handleGetClass(handlerContext, {
          class_name: className,
          version: 'active',
        });

        if (readResponse.isError) {
          const errorMsg = extractErrorMessage(readResponse);
          throw new Error(`GetClass failed: ${errorMsg}`);
        }

        const readData = parseHandlerResponse(readResponse);
        expect(readData.success).toBe(true);
        expect(readData.class_name).toBe(className.toUpperCase());

        // Step 3: Update CDS unit test class (optional)
        if (updateTestClassSource) {
          testLogger?.info(`   • update cds unit test: ${className}`);
          const updateResponse = await handleUpdateCdsUnitTest(handlerContext, {
            class_name: className,
            test_class_source: updateTestClassSource,
            transport_request: params.transport_request,
          });

          if (updateResponse.isError) {
            const errorMsg = extractErrorMessage(updateResponse);
            throw new Error(`UpdateCdsUnitTest failed: ${errorMsg}`);
          }

          const updateData = parseHandlerResponse(updateResponse);
          expect(updateData.success).toBe(true);
          testLogger?.success(`update cds unit test: ${className} done`);
        } else {
          testLogger?.warn(
            'update_test_class_source not provided, skipping update step',
          );
        }

        // Step 4: Run unit test by class to obtain run_id
        testLogger?.info(
          `   • run cds unit test: ${className}/${testClassName}`,
        );
        const runResponse = await handleRunUnitTest(handlerContext, {
          tests: [
            {
              container_class: className,
              test_class: testClassName,
            },
          ],
          title: `CDS unit test run for ${className}`,
        });

        if (runResponse.isError) {
          const errorMsg = extractErrorMessage(runResponse);
          throw new Error(`CreateUnitTest failed: ${errorMsg}`);
        }

        const runData = parseHandlerResponse(runResponse);
        expect(runData.success).toBe(true);
        expect(runData.run_id).toBeDefined();

        const runId = runData.run_id;
        testLogger?.success(
          `run cds unit test: ${className}/${testClassName} (run_id: ${runId})`,
        );

        await delay(5000);

        testLogger?.info(`   • get cds unit test status: run_id ${runId}`);
        const getStatusResponse = await handleGetCdsUnitTestStatus(
          handlerContext,
          {
            run_id: runId,
            with_long_polling: true,
          },
        );

        if (getStatusResponse.isError) {
          const errorMsg = extractErrorMessage(getStatusResponse);
          testLogger?.warn(
            `GetCdsUnitTestStatus failed (test might not be ready yet): ${errorMsg}`,
          );
        } else {
          const getStatusData = parseHandlerResponse(getStatusResponse);
          expect(getStatusData.success).toBe(true);
          expect(getStatusData.run_id).toBe(runId);
          testLogger?.success(`get cds unit test status: run_id ${runId}`);
        }

        testLogger?.info(`   • get cds unit test result: run_id ${runId}`);
        const getResultResponse = await handleGetCdsUnitTestResult(
          handlerContext,
          {
            run_id: runId,
            with_navigation_uris: false,
            format: 'abapunit',
          },
        );

        if (getResultResponse.isError) {
          const errorMsg = extractErrorMessage(getResultResponse);
          testLogger?.warn(
            `GetCdsUnitTestResult failed (test might not be ready yet): ${errorMsg}`,
          );
        } else {
          const getResultData = parseHandlerResponse(getResultResponse);
          expect(getResultData.success).toBe(true);
          expect(getResultData.run_id).toBe(runId);
          testLogger?.success(`get cds unit test result: run_id ${runId}`);
        }

        // Step 5: Delete CDS unit test class (final step)
        testLogger?.info(`   • delete cds unit test: ${className}`);
        const deleteResponse = await handleDeleteCdsUnitTest(handlerContext, {
          class_name: className,
          transport_request: params.transport_request,
        });

        if (deleteResponse.isError) {
          const errorMsg = extractErrorMessage(deleteResponse);
          throw new Error(`DeleteCdsUnitTest failed: ${errorMsg}`);
        }

        const deleteData = parseHandlerResponse(deleteResponse);
        expect(deleteData.success).toBe(true);
        deletedInTest = true;
        testLogger?.success(`delete cds unit test: ${className} done`);
      });
    },
    getTimeout('long'),
  );
});
