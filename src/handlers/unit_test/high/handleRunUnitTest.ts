/**
 * RunUnitTest — run every ABAP Unit test of a class and answer the result.
 * Waits for the run within a bound; a run that outlasts it answers its run_id.
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
  name: 'RunUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Runs the ABAP Unit tests of the ABAP class named by class_name and returns the result. runner async (default): the run is started and waited for within a bound, and a run that outlasts it returns its run_id, whose status and result are read by run_id; suited to long suites. runner sync: one request that returns the finished result.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class whose tests run.',
      },
      runner: RUNNER_PROPERTY.runner,
      scope: SCOPE_PROPERTY.scope,
      ...DETAIL_PROPERTY,
    },
    required: ['class_name'],
  },
} as const;

interface RunUnitTestArgs {
  class_name: string;
  runner?: 'async' | 'sync';
  scope?: UnitTestScopeArgs;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleRunUnitTest(
  context: HandlerContext,
  args: RunUnitTestArgs,
) {
  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  const runner = runnerOf(args);
  if (runner instanceof Error) return return_error(runner);
  const detail = detailOf(args);
  const runOptions = { scope: scopeOf(args.scope) };
  if (runner === 'sync') {
    return answer(
      { tool: 'RunUnitTest', detail },
      () =>
        runTestsSync(
          context,
          {
            carrier: 'class',
            target: args.class_name.toUpperCase(),
          },
          runOptions,
        ),
      projectSync(detail),
    );
  }
  return answer(
    { tool: 'RunUnitTest', detail },
    () => runAndWait(context, 'class', args.class_name, runOptions),
    projectRun(detail),
  );
}
