import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'AmdpDebugStop',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Ends the AMDP part of a debug session, releasing a suspended debuggee first; a part that could not be undone is reported and kept.',
  inputSchema: {
    type: 'object',
    properties: { ...STATE_HANDLE_PROPERTY, ...DETAIL_PROPERTY },
    required: ['state_handle'],
  },
} as const;

export async function handleAmdpDebugStop(context: HandlerContext, args: any) {
  return debugAnswer(
    args,
    async () => {
      const d = requireDebugger(context, args, 'use');
      context.state!.endWhenEmpty();
      await d.amdp.stop();
      return { value: { state: 'stopped' }, raw: '' };
    },
    (v) => v,
  );
}
