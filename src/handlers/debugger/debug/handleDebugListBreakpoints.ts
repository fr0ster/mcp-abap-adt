import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugListBreakpoints.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugListBreakpoints',
  available_in: ['onprem', 'cloud'] as const,
  description: '[read-only] [debug] Breakpoints a debug session armed.',
  inputSchema: z.object({ ...STATE_HANDLE_PROPERTY, ...DETAIL_SHAPE }),
} as const;

export async function handleDebugListBreakpoints(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
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
