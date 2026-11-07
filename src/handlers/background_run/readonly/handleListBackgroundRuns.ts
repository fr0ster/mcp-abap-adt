import * as z from 'zod';
import { answerBackgroundList } from '../../../lib/backgroundRuns/answers';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'ListBackgroundRuns',
  description:
    "[read-only] [runtime] Lists your background runs: run_handle, tool, object, when it started, and its state: running, finished or cancelled. A run's output is read by its run_handle; a read run leaves the list once its answer was read.",
  inputSchema: z.object({}),
} as const;

export async function handleListBackgroundRuns(
  context: HandlerContext,
  _args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundList(context);
}
