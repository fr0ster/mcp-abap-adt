import { answerBackgroundGet } from '../../../lib/backgroundRuns/answers';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'GetBackgroundRun',
  description:
    '[runtime] Reads one of your background runs by its run_handle: running, or finished with what the run tool answered (the system answer as it is, an error included). Reading does not remove it; a finished run is kept until you discard it.',
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

export async function handleGetBackgroundRun(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundGet(context, args.run_handle);
}
