import { answerBackgroundDiscard } from '../../../lib/backgroundRuns/answers';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DiscardBackgroundRun',
  description:
    '[read-only] [runtime] Removes the kept answer of one of your finished background runs. Works on a finished run; a started run runs to its end.',
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

export async function handleDiscardBackgroundRun(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundDiscard(context, args.run_handle);
}
