import * as z from 'zod';
import { answerBackgroundList } from '../../backgroundRuns/answers';
import type { HandlerContext } from '../../handlers/index';

export const TOOL_DEFINITION = {
  name: 'HandlerBackgroundRunList',
  description:
    "[read-only] Lists your background runs: run_handle, tool, object, when it started, and running or finished. A run's output is read by its run_handle.",
  inputSchema: z.object({}),
} as const;

export async function handleHandlerBackgroundRunList(
  context: HandlerContext,
  _args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundList(context);
}
