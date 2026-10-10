// src/handlers/debugger/debug/handleDebugTerminate.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugStateAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugTerminate',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Ends the stopped debuggee where it stands; the program does not run on.',
  inputSchema: {
    type: 'object',
    properties: { ...STATE_HANDLE_PROPERTY, ...DETAIL_PROPERTY },
    required: ['state_handle'],
  },
} as const;

export async function handleDebugTerminate(context: HandlerContext, args: any) {
  return debugStateAnswer(args, async () =>
    requireDebugger(context, args, 'use').abap.terminate(),
  );
}
