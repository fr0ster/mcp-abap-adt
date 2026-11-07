import * as z from 'zod';
import { answerBackgroundGet } from '../../backgroundRuns/answers';
import type { HandlerContext } from '../../handlers/index';

export const TOOL_DEFINITION = {
  name: 'HandlerBackgroundRunGet',
  description:
    "[read-only] Reads one of your background runs by its run_handle: running; finished with what the run tool answered (the system answer as it is, an error included); or cancelled. A read run's finished or cancelled answer is answered once and then deleted, so a lost answer is read again by starting the read again; a code run's answer is kept until it is discarded.",
  inputSchema: z.object({
    run_handle: z
      .string()
      .describe('The run_handle a background run answered at its start.'),
  }),
} as const;

export async function handleHandlerBackgroundRunGet(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundGet(context, args.run_handle);
}
