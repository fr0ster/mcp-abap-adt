import * as z from 'zod';
import { answerBackgroundDiscard } from '../../../lib/backgroundRuns/answers';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DiscardBackgroundRun',
  description:
    '[read-only] [runtime] Removes the kept answer of one of your finished background runs. Works on a finished run; a started run runs to its end.',
  inputSchema: z.object({
    run_handle: z
      .string()
      .describe('The run_handle a run started with background=true answered.'),
  }),
} as const;

export async function handleDiscardBackgroundRun(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundDiscard(context, args.run_handle);
}
