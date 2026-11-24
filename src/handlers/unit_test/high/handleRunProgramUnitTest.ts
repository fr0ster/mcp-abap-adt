import * as z from 'zod';
import { wireAnswer } from '../../../lib/detail';
import {
  ASSEMBLED_DETAIL_SHAPE,
  levelOf,
} from '../../../lib/strategies/detail';
import { RUNNER_FIELD, SCOPE_FIELD, WAIT_FIELD } from '../shared/runner';
/**
 * RunProgramUnitTest — run every ABAP Unit test of a report, in its source or
 * its includes, and answer the result.
 */

import { answer } from '../../../lib/answer';
import { toolDescription } from '../../../lib/description';
import { unitTestRun } from '../../../lib/description/runs';
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
  description: toolDescription(
    unitTestRun('the ABAP Unit tests of an ABAP report', 'sync'),
  ),
  inputSchema: z.object({
    program_name: z.string().describe('Report whose tests run.'),
    runner: RUNNER_FIELD,
    wait: WAIT_FIELD,
    scope: SCOPE_FIELD,
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

type RunProgramUnitTestArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * The tool's answer; at `raw` what ADT sent: the documents the call's
 * reads answered, read with the tool at full (`wireAnswer`).
 */
export async function handleRunProgramUnitTest(
  context: HandlerContext,
  args: RunProgramUnitTestArgs,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'RunProgramUnitTest',
        shape: 'assembled',
      },
      () => answeredRunProgramUnitTest(context, { ...args, detail: 'full' }),
    );
  }
  return answeredRunProgramUnitTest(context, args);
}

async function answeredRunProgramUnitTest(
  context: HandlerContext,
  args: RunProgramUnitTestArgs,
) {
  if (!args?.program_name) {
    return return_error(new Error('program_name is required'));
  }
  const runner = runnerOf(args);
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
