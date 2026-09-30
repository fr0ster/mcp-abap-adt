/**
 * RunProgramUnitTest — run every ABAP Unit test of a report, in its source or
 * its includes, and answer the result.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';
import { projectRun, runAndWait } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'RunProgramUnitTest',
  available_in: ['onprem'] as const,
  description: 'Run the ABAP Unit tests of a report and return the result.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'Report whose tests run.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['program_name'],
  },
} as const;

interface RunProgramUnitTestArgs {
  program_name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleRunProgramUnitTest(
  context: HandlerContext,
  args: RunProgramUnitTestArgs,
) {
  if (!args?.program_name) {
    return return_error(new Error('program_name is required'));
  }
  const detail = detailOf(args);
  return answer(
    { tool: 'RunProgramUnitTest', detail },
    () => runAndWait(context, 'program', args.program_name),
    projectRun(detail),
  );
}
