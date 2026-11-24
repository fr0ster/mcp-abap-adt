import * as z from 'zod';
import { answerBackgroundDiscard } from '../../../lib/backgroundRuns/answers';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { BACKGROUND_RUN_ENDED } from '../../../lib/description/sessions';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DiscardBackgroundRun',
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        "Ends a background run by its run handle: a running read is cancelled and its session logged off, an ended run's answer deleted.",
      ),
      result: BACKGROUND_RUN_ENDED,
    }),
  ),
  inputSchema: z.object({
    run_handle: z
      .string()
      .describe('The run_handle a background run answered at its start.'),
  }),
} as const;

export async function handleDiscardBackgroundRun(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundDiscard(context, args.run_handle);
}
