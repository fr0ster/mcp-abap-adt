import { answerBackgroundDiscard } from '../../backgroundRuns/answers';
import type { ArgsOf, HandlerContext } from '../../handlers/index';

export const TOOL_DEFINITION = {
  name: 'HandlerBackgroundRunDiscard',
  description:
    'Removes the kept answer of one of your finished background runs. A run still running cannot be discarded: a started run cannot be stopped.',
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

export async function handleHandlerBackgroundRunDiscard(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundDiscard(context, args.run_handle);
}
