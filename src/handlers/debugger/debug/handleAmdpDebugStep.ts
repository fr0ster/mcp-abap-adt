import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'AmdpDebugStep',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Steps the stopped AMDP debuggee over a statement or on to the next stop.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      action: {
        type: 'string',
        enum: ['over', 'continue'],
        description:
          'over runs the current statement, continue runs to the next stop.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'action'],
  },
} as const;

export async function handleAmdpDebugStep(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () => requireDebugger(context, args, 'use').amdp.step(args.action),
    (v) => ({ state: v }),
  );
}
