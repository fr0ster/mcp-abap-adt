// src/handlers/debugger/debug/handleDebugSetStackPosition.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { terseStop } from '../../../lib/debugger/readings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugSetStackPosition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Selects the stack frame variables are read in; what runs next does not change. Needs a stopped debuggee.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      position: {
        type: 'integer',
        description:
          'Frame position as the stack numbers it; the stopped frame has the highest position.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'position'],
  },
} as const;

export async function handleDebugSetStackPosition(
  context: HandlerContext,
  args: any,
) {
  return debugAnswer(
    args,
    async () =>
      requireDebugger(context, args, 'use').abap.setStackPosition(
        Number(args.position),
      ),
    (s) => terseStop(s.debuggee, s.stack),
  );
}
