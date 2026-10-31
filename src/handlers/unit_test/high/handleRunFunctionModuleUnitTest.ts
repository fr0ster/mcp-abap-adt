/**
 * RunFunctionModuleUnitTest — run the ABAP Unit tests that exercise one
 * function module and answer the result.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';
import {
  RUNNER_PROPERTY,
  runnerOf,
  runnerWaitOf,
  SCOPE_PROPERTY,
  scopeOf,
  type UnitTestScopeArgs,
  WAIT_PROPERTY,
} from '../shared/runner';
import { projectSync, runTestsSync } from '../shared/runSync';
import { projectRun, runAndWait } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'RunFunctionModuleUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Runs the ABAP Unit tests of the function module named by function_module_name. runner async (default): the run is started; with wait true (default) its status is read once by long polling, SAP holding the read until the run finishes: a run SAP answers finished returns its result, the call lasting as long as the run, and a run SAP answers with another status returns the run_id and that status, read on by run_id with GetUnitTestResult or GetUnitTestStatus; with wait false the call answers the run_id right after the start, and the status and result are read by run_id; suited to long suites. A long run under a client with a request time limit is started with wait false. runner sync: one request, addressed by function_group_name and function_module_name, that returns the finished result of every test of the module's function group, called with wait left out.",
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description: 'Function module whose tests run.',
      },
      function_group_name: {
        type: 'string',
        description:
          'Function group holding the function module; required by runner sync.',
      },
      runner: RUNNER_PROPERTY.runner,
      wait: WAIT_PROPERTY.wait,
      scope: SCOPE_PROPERTY.scope,
      ...DETAIL_PROPERTY,
    },
    required: ['function_module_name'],
  },
} as const;

interface RunFunctionModuleUnitTestArgs {
  function_module_name: string;
  function_group_name?: string;
  runner?: 'async' | 'sync';
  wait?: boolean;
  scope?: UnitTestScopeArgs;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleRunFunctionModuleUnitTest(
  context: HandlerContext,
  args: RunFunctionModuleUnitTestArgs,
) {
  if (!args?.function_module_name) {
    return return_error(new Error('function_module_name is required'));
  }
  const runner = runnerOf(args);
  if (runner instanceof Error) return return_error(runner);
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
        runTestsSync(
          context,
          {
            carrier: 'functionModule',
            functionGroupName,
            functionModuleName: args.function_module_name,
          },
          runOptions,
        ),
      projectSync(detail),
    );
  }
  return answer(
    { tool: 'RunFunctionModuleUnitTest', detail },
    () =>
      runAndWait(
        context,
        'functionModule',
        args.function_module_name,
        wait,
        runOptions,
      ),
    projectRun(detail),
  );
}
