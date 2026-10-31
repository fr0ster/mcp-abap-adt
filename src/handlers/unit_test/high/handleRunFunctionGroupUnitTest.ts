/**
 * RunFunctionGroupUnitTest — run every ABAP Unit test of a function group and
 * answer the result.
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
  name: 'RunFunctionGroupUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Runs every ABAP Unit test of the function group named by function_group_name. runner async (default): the run is started; with wait true (default) its status is read once by long polling, SAP holding the read until the run finishes: a run SAP answers finished returns its result, the call lasting as long as the run, and a run SAP answers with another status returns the run_id and that status, read on by run_id; with wait false the call answers the run_id right after the start, and the status and result are read by run_id; suited to long suites. A long run under a client with a request time limit is started with wait false. runner sync: one request that returns the finished result, called with wait left out.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Function group whose tests run.',
      },
      runner: RUNNER_PROPERTY.runner,
      wait: WAIT_PROPERTY.wait,
      scope: SCOPE_PROPERTY.scope,
      ...DETAIL_PROPERTY,
    },
    required: ['function_group_name'],
  },
} as const;

interface RunFunctionGroupUnitTestArgs {
  function_group_name: string;
  runner?: 'async' | 'sync';
  wait?: boolean;
  scope?: UnitTestScopeArgs;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleRunFunctionGroupUnitTest(
  context: HandlerContext,
  args: RunFunctionGroupUnitTestArgs,
) {
  if (!args?.function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }
  const runner = runnerOf(args);
  if (runner instanceof Error) return return_error(runner);
  const wait = runnerWaitOf(args, runner);
  if (wait instanceof Error) return return_error(wait);
  const detail = detailOf(args);
  const runOptions = { scope: scopeOf(args.scope) };
  if (runner === 'sync') {
    return answer(
      { tool: 'RunFunctionGroupUnitTest', detail },
      () =>
        runTestsSync(
          context,
          {
            carrier: 'functionGroup',
            functionGroupName: args.function_group_name,
          },
          runOptions,
        ),
      projectSync(detail),
    );
  }
  return answer(
    { tool: 'RunFunctionGroupUnitTest', detail },
    () =>
      runAndWait(
        context,
        'functionGroup',
        args.function_group_name,
        wait,
        runOptions,
      ),
    projectRun(detail),
  );
}
