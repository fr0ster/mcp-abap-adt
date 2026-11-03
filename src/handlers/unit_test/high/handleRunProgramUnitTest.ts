import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import { RUNNER_FIELD, SCOPE_FIELD, WAIT_FIELD } from '../shared/runner';
/**
 * RunProgramUnitTest — run every ABAP Unit test of a report, in its source or
 * its includes, and answer the result.
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
  name: 'RunProgramUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Runs the ABAP Unit tests of the report named by program_name. runner async (default): the run is started; with wait true (default) its status is read once by long polling, SAP holding the read until the run finishes: a run SAP answers finished returns its result, the call lasting as long as the run, and a run SAP answers with another status returns the run_id and that status, read on by run_id; with wait false the call answers the run_id right after the start, and the status and result are read by run_id; suited to long suites. A long run under a client with a request time limit is started with wait false. runner sync: one request that returns the finished result, called with wait left out. On ABAP Cloud, the programs are SAP's standard programs.",
  inputSchema: z.object({
    program_name: z.string().describe('Report whose tests run.'),
    runner: RUNNER_FIELD,
    wait: WAIT_FIELD,
    scope: SCOPE_FIELD,
    ...DETAIL_SHAPE,
  }),
} as const;

interface RunProgramUnitTestArgs {
  program_name: string;
  runner?: 'async' | 'sync';
  wait?: boolean;
  scope?: UnitTestScopeArgs;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleRunProgramUnitTest(
  context: HandlerContext,
  args: RunProgramUnitTestArgs,
) {
  if (!args?.program_name) {
    return return_error(new Error('program_name is required'));
  }
  const runner = runnerOf(args);
  if (runner instanceof Error) return return_error(runner);
  const wait = runnerWaitOf(args, runner);
  if (wait instanceof Error) return return_error(wait);
  const detail = detailOf(args);
  const runOptions = { scope: scopeOf(args.scope) };
  if (runner === 'sync') {
    return answer(
      { tool: 'RunProgramUnitTest', detail },
      () =>
        runTestsSync(
          context,
          {
            carrier: 'program',
            programName: args.program_name,
          },
          runOptions,
        ),
      projectSync(detail),
    );
  }
  return answer(
    { tool: 'RunProgramUnitTest', detail },
    () => runAndWait(context, 'program', args.program_name, wait, runOptions),
    projectRun(detail),
  );
}
