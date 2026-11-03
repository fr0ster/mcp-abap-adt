import * as z from 'zod';
import { answerBackgroundGet } from '../../backgroundRuns/answers';
import type { HandlerContext } from '../../handlers/index';

export const TOOL_DEFINITION = {
  name: 'HandlerBackgroundRunGet',
  description:
    '[read-only] Reads one of your background runs by its run_handle: running, or finished with what the run tool answered (the system answer as it is, an error included). A read keeps the run.',
  inputSchema: z.object({
    run_handle: z
      .string()
      .describe('The run_handle a run started with background=true answered.'),
  }),
} as const;

export async function handleHandlerBackgroundRunGet(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundGet(context, args.run_handle);
}
