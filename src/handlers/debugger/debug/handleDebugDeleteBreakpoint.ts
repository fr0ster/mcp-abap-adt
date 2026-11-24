import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugDeleteBreakpoint.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { purpose, toolDescription } from '../../../lib/description';
import { DELETED } from '../../../lib/description/debugger';
import { runParts } from '../../../lib/description/runs';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugDeleteBreakpoint',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'debug',
      purpose: purpose(
        'Removes one breakpoint of an ABAP debug session by its id, the rest staying armed.',
      ),
      result: DELETED,
    }),
  ),
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    breakpoint_id: z.string().describe('Breakpoint id.'),
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleDebugDeleteBreakpoint(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () => {
      await requireDebugger(context, args, 'use').abap.deleteBreakpoint(
        args.breakpoint_id,
      );
      return { value: { deleted: args.breakpoint_id }, raw: '' };
    },
    (v) => v,
  );
}
