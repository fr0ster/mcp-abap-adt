import * as z from 'zod';
import { TOOL_DEFINITION as DiscardBackgroundRun } from '../../../handlers/background_run/readonly/handleDiscardBackgroundRun';
import { answerBackgroundDiscard } from '../../backgroundRuns/answers';
import { compactOf } from '../../description/index';
import type { HandlerContext } from '../../handlers/index';

export const TOOL_DEFINITION = {
  name: 'HandlerBackgroundRunDiscard',
  description: compactOf(DiscardBackgroundRun.description),
  inputSchema: z.object({
    run_handle: z
      .string()
      .describe('The run_handle a background run answered at its start.'),
  }),
} as const;

export async function handleHandlerBackgroundRunDiscard(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundDiscard(context, args.run_handle);
}
