// src/handlers/debugger/debug/handleDebugStep.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugStateAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugStep',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Moves the stopped debuggee into a call, over it, out of the current one, or on to the next stop.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      action: {
        type: 'string',
        enum: ['into', 'over', 'return', 'continue'],
        description:
          'into enters the call, over runs it, return leaves the current one, continue runs to the next stop.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'action'],
  },
} as const;

const STEPS = {
  into: 'stepInto',
  over: 'stepOver',
  return: 'stepReturn',
  continue: 'stepContinue',
} as const;

export async function handleDebugStep(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugStateAnswer(args, async () =>
    requireDebugger(context, args, 'use').abap.step(STEPS[args.action]),
  );
}
