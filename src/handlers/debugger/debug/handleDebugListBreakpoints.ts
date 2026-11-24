import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugListBreakpoints.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { purpose, toolDescription } from '../../../lib/description';
import { BREAKPOINTS } from '../../../lib/description/debugger';
import { runParts } from '../../../lib/description/runs';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugListBreakpoints',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose('Shows the breakpoints an ABAP debug session armed.'),
      result: BREAKPOINTS,
    }),
  ),
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
