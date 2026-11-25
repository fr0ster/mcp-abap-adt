import * as z from 'zod';
import { answerBackgroundGet } from '../../../lib/backgroundRuns/answers';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'GetBackgroundRun',
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        "Reads one of the caller's background runs by its run handle, with the answer of a run that has ended.",
      ),
    }),
  ),
  inputSchema: z.object({
    run_handle: z
      .string()
      .describe('The run_handle a background run answered at its start.'),
  }),
} as const;

export async function handleGetBackgroundRun(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundGet(context, args.run_handle);
}
