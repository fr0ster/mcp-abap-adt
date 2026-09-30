/**
 * Integration tests for a report's ABAP Unit tools: CreateProgramUnitTest,
 * RunProgramUnitTest, UpdateProgramUnitTest. The suite builds its own report and
 * deletes it with its test include.
 *
 * Run: npm test -- --testPathPatterns=integration/high/unitTest/ProgramUnitTestHighHandlers
 */

import { handleCreateProgram } from '../../../../handlers/program/high/handleCreateProgram';
import { handleDeleteProgram } from '../../../../handlers/program/high/handleDeleteProgram';
import { handleUpdateProgram } from '../../../../handlers/program/high/handleUpdateProgram';
import { handleCreateProgramUnitTest } from '../../../../handlers/unit_test/high/handleCreateProgramUnitTest';
import { handleRunProgramUnitTest } from '../../../../handlers/unit_test/high/handleRunProgramUnitTest';
import { handleUpdateProgramUnitTest } from '../../../../handlers/unit_test/high/handleUpdateProgramUnitTest';
import { programTestInclude } from '../../../../handlers/unit_test/shared/writeTests';
import { createAdtClient } from '../../../../lib/clients';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { expectTestsRan, stepsFor } from './unitTestSteps';

describe('Unit Test High-Level Handlers (report)', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('program-unit-test-high');

  beforeAll(async () => {
    tester = new LambdaTester(
      'program_unit_test',
      'full_workflow',
      'program-unit-test-high',
      'full_workflow',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {},
      async (context: LambdaTesterContext) => {
        const programName = context.params?.program_name;
        if (!programName) return;
        const steps = stepsFor(tester, context);
        await steps.cleanup(
          'DeleteProgram',
          {
            program_name: programName,
            transport_request: context.transportRequest,
          },
          handleDeleteProgram,
        );
        // No tool deletes a report include; the suite removes the one it made.
        try {
          await createAdtClient(context.connection)
            .getInclude()
            .delete({
              includeName: programTestInclude(programName),
              transportRequest: context.transportRequest,
            });
        } catch (error: any) {
          context.logger?.warn?.(
            `cleanup include (ignored): ${error?.message ?? error}`,
          );
        }
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
        const programName: string | undefined = params?.program_name;
        if (!programName || !params?.test_class_source || !packageName) {
          logger?.warn('program_unit_test not configured, skipping');
          return;
        }
        const transport = { transport_request: transportRequest };
        const { step } = stepsFor(tester, context);
        const expected: string[] = params.expected_test_methods ?? [];

        await step(
          'CreateProgram',
          {
            program_name: programName,
            package_name: packageName,
            description: 'ABAP Unit test report',
            ...transport,
          },
          handleCreateProgram,
        );
        await step(
          'UpdateProgram',
          {
            program_name: programName,
            source_code: params.program_source,
            activate: true,
            ...transport,
          },
          handleUpdateProgram,
        );

        await step(
          'CreateProgramUnitTest',
          {
            program_name: programName,
            test_class_source: params.test_class_source,
            ...transport,
          },
          handleCreateProgramUnitTest,
        );
        expectTestsRan(
          await step(
            'RunProgramUnitTest',
            { program_name: programName },
            handleRunProgramUnitTest,
          ),
          expected,
        );

        await step(
          'UpdateProgramUnitTest',
          {
            program_name: programName,
            test_class_source: params.test_class_source,
            ...transport,
          },
          handleUpdateProgramUnitTest,
        );
        expectTestsRan(
          await step(
            'RunProgramUnitTest',
            { program_name: programName },
            handleRunProgramUnitTest,
          ),
          expected,
        );
      });
    },
    getTimeout('long'),
  );
});
