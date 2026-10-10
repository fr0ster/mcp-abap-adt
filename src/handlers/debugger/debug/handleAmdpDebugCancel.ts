import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'AmdpDebugCancel',
  available_in: ['onprem', 'cloud'] as const,
  description: "[debug] Cancels the stopped AMDP debuggee's execution.",
  inputSchema: {
    type: 'object',
    properties: { ...STATE_HANDLE_PROPERTY, ...DETAIL_PROPERTY },
    required: ['state_handle'],
  },
} as const;

export async function handleAmdpDebugCancel(
  context: HandlerContext,
  args: any,
) {
  return debugAnswer(
    args,
    async () => {
      await requireDebugger(context, args, 'use').amdp.cancel();
      return { value: 'cancelled', raw: '' };
    },
    (v) => v,
  );
}
