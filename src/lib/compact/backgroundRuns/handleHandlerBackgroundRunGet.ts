import { answerBackgroundGet } from '../../backgroundRuns/answers';
import type { ArgsOf, HandlerContext } from '../../handlers/index';

export const TOOL_DEFINITION = {
  name: 'HandlerBackgroundRunGet',
  description:
    'Reads one of your background runs by its run_handle: running, or finished with what HandlerProfileRun answered (the system answer as it is, an error included). Reading does not remove it.',
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
