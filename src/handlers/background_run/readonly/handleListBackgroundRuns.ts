import { answerBackgroundList } from '../../../lib/backgroundRuns/answers';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'ListBackgroundRuns',
  description:
    "[runtime] Lists your background runs: run_handle, tool, object, when it started, and running or finished. A run's output is read by its run_handle.",
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
} as const;

export async function handleListBackgroundRuns(
  context: HandlerContext,
  _args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundList(context);
}
