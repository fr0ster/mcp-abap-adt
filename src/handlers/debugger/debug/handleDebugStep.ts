// src/handlers/debugger/debug/handleDebugStep.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugStateAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
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

export async function handleDebugStep(context: HandlerContext, args: any) {
  return debugStateAnswer(args, async () => {
    const method = STEPS[String(args.action) as keyof typeof STEPS];
    if (!method) throw new Error('action: into, over, return or continue');
    return requireDebugger(context, args, 'use').abap.step(method);
  });
}
