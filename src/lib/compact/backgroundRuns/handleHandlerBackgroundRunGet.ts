import { answerBackgroundGet } from '../../backgroundRuns/answers';
import type { ArgsOf, HandlerContext } from '../../handlers/index';

export const TOOL_DEFINITION = {
  name: 'HandlerBackgroundRunGet',
  description:
    '[read-only] Reads one of your background runs by its run_handle: running, or finished with what the run tool answered (the system answer as it is, an error included). A read keeps the run.',
  inputSchema: {
    type: 'object',
    properties: {
      run_handle: {
        type: 'string',
        description:
          'The run_handle a run started with background=true answered.',
      },
    },
    required: ['run_handle'],
  },
} as const;

export async function handleHandlerBackgroundRunGet(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundGet(context, args.run_handle);
}
