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
  description:
    "Runs the ABAP Unit tests of the module's whole function group: the function module named by function_module_name is run, and SAP runs the tests of the function group holding it. runner async (default), addressed by function_module_name alone: the run is started; with wait true (default) its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes: a run SAP answers finished returns its result, the call lasting as long as the run, a run SAP reports unstarted is read again by long polling, and a run that long-polled read reports unstarted returns the run_id and that status, and any other status is an error stating what SAP answered; with wait false the call answers the run_id right after the start, and the status and result are read by run_id; suited to long suites. A long run under a client with a request time limit is started with wait false. runner sync: one request, addressed by function_group_name and function_module_name, that returns the finished result of every test of the module's function group, called with wait left out.",
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
