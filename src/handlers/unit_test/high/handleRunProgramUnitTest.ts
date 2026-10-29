/**
 * RunProgramUnitTest — run every ABAP Unit test of a report, in its source or
 * its includes, and answer the result.
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
  name: 'RunProgramUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[read-only] Runs the ABAP Unit tests of the report named by program_name and returns the result. runner async (default): the run is started and waited for within a bound, and a run that outlasts it returns its run_id, whose status and result are read by run_id; suited to long suites. runner sync: one request that returns the finished result. On ABAP Cloud, the programs are SAP's standard programs.",
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'Report whose tests run.',
      },
      runner: RUNNER_PROPERTY.runner,
      scope: SCOPE_PROPERTY.scope,
      ...DETAIL_PROPERTY,
    },
    required: ['program_name'],
  },
} as const;

interface RunProgramUnitTestArgs {
  program_name: string;
  runner?: 'async' | 'sync';
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
    () => runAndWait(context, 'program', args.program_name, runOptions),
    projectRun(detail),
  );
}
