/**
 * Integration tests for a class's ABAP Unit tools: CreateUnitTest, RunUnitTest,
 * UpdateUnitTest, DeleteUnitTest. The suite builds its own class and deletes it.
 *
 * Run: npm test -- --testPathPatterns=integration/high/unitTest/ClassUnitTestHighHandlers
 */

import { handleCreateClass } from '../../../../handlers/class/high/handleCreateClass';
import { handleDeleteClass } from '../../../../handlers/class/high/handleDeleteClass';
import { handleUpdateClass } from '../../../../handlers/class/high/handleUpdateClass';
import { handleCreateUnitTest } from '../../../../handlers/unit_test/high/handleCreateUnitTest';
import { handleDeleteUnitTest } from '../../../../handlers/unit_test/high/handleDeleteUnitTest';
import { handleRunUnitTest } from '../../../../handlers/unit_test/high/handleRunUnitTest';
import { handleUpdateUnitTest } from '../../../../handlers/unit_test/high/handleUpdateUnitTest';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { expectTestsRan, stepsFor } from './unitTestSteps';

describe('Unit Test High-Level Handlers (class)', () => {
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
      async (_context: LambdaTesterContext) => {},
      async (context: LambdaTesterContext) => {
        const className = context.params?.class_name;
        if (!className) return;
        await stepsFor(tester, context).cleanup(
          'DeleteClass',
          {
            class_name: className,
            transport_request: context.transportRequest,
          },
          handleDeleteClass,
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
        if (!className || !params?.test_class_source || !packageName) {
          logger?.warn('class_unit_test not configured, skipping');
          return;
        }
        const transport = { transport_request: transportRequest };
        const { step } = stepsFor(tester, context);
        const expected: string[] = params.expected_test_methods ?? [];

        // The class under test: tests go into its include once it is active.
        await step(
          'CreateClass',
          {
            class_name: className,
            package_name: packageName,
            description: 'ABAP Unit test class',
            ...transport,
          },
          handleCreateClass,
        );
        await step(
          'UpdateClass',
          {
            class_name: className,
            source_code: params.class_source,
            activate: true,
            ...transport,
          },
          handleUpdateClass,
        );

        await step(
          'CreateUnitTest',
          {
            class_name: className,
            test_class_source: params.test_class_source,
            ...transport,
          },
          handleCreateUnitTest,
        );
        expectTestsRan(
          await step(
            'RunUnitTest',
            { class_name: className },
            handleRunUnitTest,
          ),
          expected,
        );

        await step(
          'UpdateUnitTest',
          {
            class_name: className,
            test_class_source: params.test_class_source,
            ...transport,
          },
          handleUpdateUnitTest,
        );
        expectTestsRan(
          await step(
            'RunUnitTest',
            { class_name: className },
            handleRunUnitTest,
          ),
          expected,
        );

        await step(
          'DeleteUnitTest',
          { class_name: className, ...transport },
          handleDeleteUnitTest,
        );
      });
    },
    getTimeout('long'),
  );
});
