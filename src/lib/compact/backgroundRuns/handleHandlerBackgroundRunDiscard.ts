import * as z from 'zod';
import { answerBackgroundDiscard } from '../../backgroundRuns/answers';
import type { HandlerContext } from '../../handlers/index';

export const TOOL_DEFINITION = {
  name: 'HandlerBackgroundRunDiscard',
  description:
    '[read-only] Removes the kept answer of one of your finished background runs. Works on a finished run; a started run runs to its end.',
  inputSchema: z.object({
    run_handle: z
      .string()
      .describe('The run_handle a run started with background=true answered.'),
  }),
} as const;

export async function handleHandlerBackgroundRunDiscard(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundDiscard(context, args.run_handle);
}
