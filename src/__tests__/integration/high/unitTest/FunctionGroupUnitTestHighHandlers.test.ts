/**
 * Integration tests for a function group's ABAP Unit tools:
 * CreateFunctionGroupUnitTest, RunFunctionGroupUnitTest, RunFunctionModuleUnitTest,
 * UpdateFunctionGroupUnitTest. The suite builds its own group and module and
 * deletes the group.
 *
 * Run: npm test -- --testPathPatterns=integration/high/unitTest/FunctionGroupUnitTestHighHandlers
 */

import { handleCreateFunctionGroup } from '../../../../handlers/function/high/handleCreateFunctionGroup';
import { handleCreateFunctionModule } from '../../../../handlers/function/high/handleCreateFunctionModule';
import { handleUpdateFunctionModule } from '../../../../handlers/function/high/handleUpdateFunctionModule';
import { handleDeleteFunctionGroup } from '../../../../handlers/function_group/high/handleDeleteFunctionGroup';
import { handleCreateFunctionGroupUnitTest } from '../../../../handlers/unit_test/high/handleCreateFunctionGroupUnitTest';
import { handleRunFunctionGroupUnitTest } from '../../../../handlers/unit_test/high/handleRunFunctionGroupUnitTest';
import { handleRunFunctionModuleUnitTest } from '../../../../handlers/unit_test/high/handleRunFunctionModuleUnitTest';
import { handleUpdateFunctionGroupUnitTest } from '../../../../handlers/unit_test/high/handleUpdateFunctionGroupUnitTest';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { expectTestsRan, stepsFor } from './unitTestSteps';

describe('Unit Test High-Level Handlers (function group)', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('function-group-unit-test-high');

  beforeAll(async () => {
    tester = new LambdaTester(
      'function_group_unit_test',
      'full_workflow',
      'function-group-unit-test-high',
      'full_workflow',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {},
      async (context: LambdaTesterContext) => {
        const groupName = context.params?.function_group_name;
        if (!groupName) return;
        await stepsFor(tester, context).cleanup(
          'DeleteFunctionGroup',
          {
            function_group_name: groupName,
            transport_request: context.transportRequest,
          },
          handleDeleteFunctionGroup,
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
        const groupName: string | undefined = params?.function_group_name;
        const moduleName: string | undefined = params?.function_module_name;
        if (
          !groupName ||
          !moduleName ||
          !params?.test_class_source ||
          !packageName
        ) {
          logger?.warn('function_group_unit_test not configured, skipping');
          return;
        }
        const transport = { transport_request: transportRequest };
        const { step } = stepsFor(tester, context);
        const expected: string[] = params.expected_test_methods ?? [];

        await step(
          'CreateFunctionGroup',
          {
            function_group_name: groupName,
            package_name: packageName,
            description: 'ABAP Unit test group',
            ...transport,
          },
          handleCreateFunctionGroup,
        );
        await step(
          'CreateFunctionModule',
          {
            function_group_name: groupName,
            function_module_name: moduleName,
            description: 'ABAP Unit test module',
            ...transport,
          },
          handleCreateFunctionModule,
        );
        await step(
          'UpdateFunctionModule',
          {
            function_group_name: groupName,
            function_module_name: moduleName,
            source_code: params.function_module_source,
            activate: true,
            ...transport,
          },
          handleUpdateFunctionModule,
        );

        await step(
          'CreateFunctionGroupUnitTest',
          {
            function_group_name: groupName,
            test_class_source: params.test_class_source,
            ...transport,
          },
          handleCreateFunctionGroupUnitTest,
        );
        expectTestsRan(
          await step(
            'RunFunctionGroupUnitTest',
            { function_group_name: groupName },
            handleRunFunctionGroupUnitTest,
          ),
          expected,
        );
        expectTestsRan(
          await step(
            'RunFunctionModuleUnitTest',
            { function_module_name: moduleName },
            handleRunFunctionModuleUnitTest,
          ),
          expected,
        );

        await step(
          'UpdateFunctionGroupUnitTest',
          {
            function_group_name: groupName,
            test_class_source: params.test_class_source,
            ...transport,
          },
          handleUpdateFunctionGroupUnitTest,
        );
        expectTestsRan(
          await step(
            'RunFunctionGroupUnitTest',
            { function_group_name: groupName },
            handleRunFunctionGroupUnitTest,
          ),
          expected,
        );
      });
    },
    getTimeout('long'),
  );
});
