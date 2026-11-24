import * as z from 'zod';
import { TOOL_DEFINITION as GetBackgroundRun } from '../../../handlers/background_run/readonly/handleGetBackgroundRun';
import { answerBackgroundGet } from '../../backgroundRuns/answers';
import { compactOf } from '../../description/index';
import type { HandlerContext } from '../../handlers/index';

export const TOOL_DEFINITION = {
  name: 'HandlerBackgroundRunGet',
  description: compactOf(GetBackgroundRun.description),
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
