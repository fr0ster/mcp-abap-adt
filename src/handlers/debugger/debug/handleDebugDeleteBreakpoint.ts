// src/handlers/debugger/debug/handleDebugDeleteBreakpoint.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugDeleteBreakpoint',
  available_in: ['onprem', 'cloud'] as const,
  description: '[debug] Removes one breakpoint of a debug session.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      breakpoint_id: { type: 'string', description: 'Breakpoint id.' },
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'breakpoint_id'],
  },
} as const;

export async function handleDebugDeleteBreakpoint(
  context: HandlerContext,
  args: any,
) {
  return debugAnswer(
    args,
    async () => {
      await requireDebugger(context, args, 'use').abap.deleteBreakpoint(
        String(args.breakpoint_id),
      );
      return { value: { deleted: args.breakpoint_id }, raw: '' };
    },
    (v) => v,
  );
}
