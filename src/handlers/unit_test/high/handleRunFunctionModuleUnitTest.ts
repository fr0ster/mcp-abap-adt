import * as z from 'zod';
import { wireAnswer } from '../../../lib/detail';
import {
  ASSEMBLED_DETAIL_SHAPE,
  levelOf,
} from '../../../lib/strategies/detail';
import { RUNNER_FIELD, SCOPE_FIELD, WAIT_FIELD } from '../shared/runner';
/**
 * RunFunctionModuleUnitTest — run the ABAP Unit tests of the function group
 * holding one function module and answer the result: SAP replaces a FUNC
 * run object by its function group (`CL_AUL_TEST_SUITE->replace_func_w_fugr`,
 * read on premise and on the cloud).
 */

import { answer } from '../../../lib/answer';
import { toolDescription } from '../../../lib/description';
import { unitTestRun } from '../../../lib/description/runs';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { inCheckedGroup } from '../../../lib/strategies/functionModuleGroup';
import { return_error } from '../../../lib/utils';
import {
  runnerOf,
  runnerWaitOf,
  scopeOf,
  type UnitTestScopeArgs,
} from '../shared/runner';
import { projectSync, runTestsSync } from '../shared/runSync';
import { projectRun, runAndWait } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'RunFunctionModuleUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    unitTestRun(
      'the ABAP Unit tests of the function group holding a function module',
      'sync',
    ),
  ),
  inputSchema: z.object({
    function_module_name: z
      .string()
      .describe('Function module whose function group the tests run for.'),
    function_group_name: z
      .string()
      .optional()
      .describe(
        'Function group holding the function module; required by runner sync.',
      ),
    runner: RUNNER_FIELD,
    wait: WAIT_FIELD,
    scope: SCOPE_FIELD,
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

type RunFunctionModuleUnitTestArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

/**
 * The tool's answer; at `raw` what ADT sent: the documents the call's
 * reads answered, read with the tool at full (`wireAnswer`).
 */
export async function handleRunFunctionModuleUnitTest(
  context: HandlerContext,
  args: RunFunctionModuleUnitTestArgs,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'RunFunctionModuleUnitTest',
        shape: 'assembled',
      },
      () =>
        answeredRunFunctionModuleUnitTest(context, { ...args, detail: 'full' }),
    );
  }
  return answeredRunFunctionModuleUnitTest(context, args);
}

async function answeredRunFunctionModuleUnitTest(
  context: HandlerContext,
  args: RunFunctionModuleUnitTestArgs,
) {
  if (!args?.function_module_name) {
    return return_error(new Error('function_module_name is required'));
  }
  const runner = runnerOf(args);
  const wait = runnerWaitOf(args, runner);
  if (wait instanceof Error) return return_error(wait);
  const detail = detailOf(args);
  const runOptions = { scope: scopeOf(args.scope) };
  if (runner === 'sync') {
    const functionGroupName = args.function_group_name;
    if (!functionGroupName) {
      return return_error(
        new Error(
          'function_group_name is required with runner sync: the synchronous run addresses the module under its function group',
        ),
      );
    }
    return answer(
      { tool: 'RunFunctionModuleUnitTest', detail },
      () =>
        inCheckedGroup(
          context,
          functionGroupName,
          args.function_module_name,
          () =>
            runTestsSync(
              context,
              {
                carrier: 'functionModule',
                functionGroupName,
                functionModuleName: args.function_module_name,
              },
              runOptions,
            ),
        ),
      projectSync(detail),
    );
  }
  // The async runner addresses the module by name alone; a group given
  // beside it is checked against the module's metadata (#2) before the run.
  const run = () =>
    runAndWait(
      context,
      'functionModule',
      args.function_module_name,
      wait,
      runOptions,
    );
  const group = args.function_group_name;
  return answer(
    { tool: 'RunFunctionModuleUnitTest', detail },
    () =>
      group === undefined || group === ''
        ? run()
        : inCheckedGroup(context, group, args.function_module_name, run),
    projectRun(detail),
  );
}
