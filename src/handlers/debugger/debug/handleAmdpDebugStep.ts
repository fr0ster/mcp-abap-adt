import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
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

export async function handleAmdpDebugStep(context: HandlerContext, args: any) {
  return debugAnswer(
    args,
    async () => {
      // Anything but the two values is a typo, not a continue.
      if (args.action !== 'over' && args.action !== 'continue')
        throw new Error('action: over or continue');
      return requireDebugger(context, args, 'use').amdp.step(args.action);
    },
    (v) => ({ state: v }),
  );
}
