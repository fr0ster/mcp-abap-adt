import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import { RUNNER_FIELD, SCOPE_FIELD, WAIT_FIELD } from '../shared/runner';
/**
 * RunUnitTest — run every ABAP Unit test of a class and answer the result.
 * With `wait` (the default) it reads the run's status by long polling until
 * SAP answers it finished; with `wait: false` it answers the run_id at once.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
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
  name: 'RunUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Runs the ABAP Unit tests of the ABAP class named by class_name. runner async (default): the run is started; with wait true (default) its status is read once by long polling, SAP holding the read until the run finishes: a run SAP answers finished returns its result, the call lasting as long as the run, and a run SAP answers with another status returns the run_id and that status, read on by run_id; with wait false the call answers the run_id right after the start, and the status and result are read by run_id; suited to long suites. A long run under a client with a request time limit is started with wait false. runner sync: one request that returns the finished result, called with wait left out.',
  inputSchema: z.object({
    class_name: z.string().describe('Class whose tests run.'),
    runner: RUNNER_FIELD,
    wait: WAIT_FIELD,
    scope: SCOPE_FIELD,
    ...DETAIL_SHAPE,
  }),
} as const;

interface RunUnitTestArgs {
  class_name: string;
  runner?: 'async' | 'sync';
  wait?: boolean;
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
  const wait = runnerWaitOf(args, runner);
  if (wait instanceof Error) return return_error(wait);
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
    () => runAndWait(context, 'class', args.class_name, wait, runOptions),
    projectRun(detail),
  );
}
