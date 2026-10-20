import { answerBackgroundList } from '../../backgroundRuns/answers';
import type { ArgsOf, HandlerContext } from '../../handlers/index';

export const TOOL_DEFINITION = {
  name: 'HandlerBackgroundRunList',
  description:
    "Lists your background runs: run_handle, tool, object, when it started, and running or finished. A run's output is read by its run_handle.",
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
} as const;

export async function handleHandlerBackgroundRunList(
  context: HandlerContext,
  _args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundList(context);
}
