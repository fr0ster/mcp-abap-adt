import * as z from 'zod';
import { answerBackgroundDiscard } from '../../../lib/backgroundRuns/answers';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DiscardBackgroundRun',
  description:
    "[read-only] [runtime] Ends the run named by run_handle: a running read is cancelled and its session logged off; a finished run's answer is deleted; a running code run is refused.",
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
