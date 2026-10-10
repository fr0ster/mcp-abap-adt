// src/handlers/debugger/debug/handleDebugListBreakpoints.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugListBreakpoints',
  available_in: ['onprem', 'cloud'] as const,
  description: '[debug] Breakpoints a debug session armed.',
  inputSchema: {
    type: 'object',
    properties: { ...STATE_HANDLE_PROPERTY, ...DETAIL_PROPERTY },
    required: ['state_handle'],
  },
} as const;

export async function handleDebugListBreakpoints(
  context: HandlerContext,
  args: any,
) {
  return debugAnswer(
    args,
    async () => {
      const l = requireDebugger(context, args, 'use').abap.listBreakpoints();
      return { value: l, raw: JSON.stringify(l) };
    },
    (v) => v,
  );
}
