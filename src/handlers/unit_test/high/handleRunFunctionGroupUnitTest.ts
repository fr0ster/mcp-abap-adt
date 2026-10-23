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
  SCOPE_PROPERTY,
  scopeOf,
  type UnitTestScopeArgs,
} from '../shared/runner';
import { projectSync, runTestsSync } from '../shared/runSync';
import { projectRun, runAndWait } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'RunFunctionGroupUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Runs every ABAP Unit test of the function group named by function_group_name and returns the result. runner async (default): the run is started and waited for within a bound, and a run that outlasts it returns its run_id, whose status and result are read by run_id; suited to long suites. runner sync: one request that returns the finished result.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Function group whose tests run.',
      },
      runner: RUNNER_PROPERTY.runner,
      scope: SCOPE_PROPERTY.scope,
      ...DETAIL_PROPERTY,
    },
    required: ['function_group_name'],
  },
} as const;

interface RunFunctionGroupUnitTestArgs {
  function_group_name: string;
  runner?: 'async' | 'sync';
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
        runOptions,
      ),
    projectRun(detail),
  );
}
