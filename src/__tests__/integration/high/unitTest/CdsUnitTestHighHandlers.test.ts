/**
 * Integration tests for a CDS view's ABAP Unit tools: CreateCdsUnitTest,
 * RunCdsUnitTest, UpdateCdsUnitTest, and DeleteCdsUnitTest as cleanup. The view
 * must exist; the test class is the suite's own.
 *
 * Run: npm test -- --testPathPatterns=integration/high/unitTest/CdsUnitTestHighHandlers
 */

import { handleCreateCdsUnitTest } from '../../../../handlers/unit_test/high/handleCreateCdsUnitTest';
import { handleDeleteCdsUnitTest } from '../../../../handlers/unit_test/high/handleDeleteCdsUnitTest';
import { handleRunCdsUnitTest } from '../../../../handlers/unit_test/high/handleRunCdsUnitTest';
import { handleUpdateCdsUnitTest } from '../../../../handlers/unit_test/high/handleUpdateCdsUnitTest';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { expectTestsRan, stepsFor } from './unitTestSteps';

describe('Unit Test High-Level Handlers (CDS view)', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('cds-unit-test-high');

  beforeAll(async () => {
    tester = new LambdaTester(
      'cds_unit_test',
      'full_workflow',
      'cds-unit-test-high',
      'full_workflow',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {},
      async (context: LambdaTesterContext) => {
        const className = context.params?.class_name;
        if (!className) return;
        await stepsFor(tester, context).cleanup(
          'DeleteCdsUnitTest',
          {
            class_name: className,
            transport_request: context.transportRequest,
          },
          handleDeleteCdsUnitTest,
        );
      },
    );
  }, getTimeout('long'));

  beforeEach(async () => {
    await tester.beforeEach(async (_context: LambdaTesterContext) => {});
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  afterAll(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {});
  });

  it(
    'Unit Test High-Level Handlers: create, run, update, run',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { params, packageName, transportRequest } = context;
        const className: string | undefined = params?.class_name;
        if (
          !className ||
          !params?.cds_view_name ||
          !params?.test_class_source ||
          !packageName
        ) {
          logger?.warn('cds_unit_test not configured, skipping');
          return;
        }
        const transport = { transport_request: transportRequest };
        const { step } = stepsFor(tester, context);
        const expected: string[] = params.expected_test_methods ?? [];

        await step(
          'CreateCdsUnitTest',
          {
            cds_view_name: params.cds_view_name,
            class_name: className,
            package_name: packageName,
            test_class_source: params.test_class_source,
            ...transport,
          },
          handleCreateCdsUnitTest,
        );
        expectTestsRan(
          await step(
            'RunCdsUnitTest',
            { class_name: className },
            handleRunCdsUnitTest,
          ),
          expected,
        );

        await step(
          'UpdateCdsUnitTest',
          {
            class_name: className,
            test_class_source:
              params.update_test_class_source ?? params.test_class_source,
            ...transport,
          },
          handleUpdateCdsUnitTest,
        );
        expectTestsRan(
          await step(
            'RunCdsUnitTest',
            { class_name: className },
            handleRunCdsUnitTest,
          ),
          expected,
        );
      });
    },
    getTimeout('long'),
  );
});
