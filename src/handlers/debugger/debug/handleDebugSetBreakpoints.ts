import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugSetBreakpoints.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import {
  BREAKPOINT_ITEM,
  BREAKPOINTS_WORDS,
  breakpointsFromArgs,
  SHARED_SET_SENTENCE,
  STATE_HANDLE_PROPERTY,
} from '../../../lib/debugger/schemas';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugSetBreakpoints',
  available_in: ['onprem', 'cloud'] as const,
  description: `[debug] Adds breakpoints to a debug session — a line, an exception class, an ABAP statement or a message; a line breakpoint may carry a condition — and answers the whole set placed, this call's refusals each with its breakpoint and reason, earlier breakpoints that dropped out of the set, and any answer row left unpaired with a breakpoint. ${SHARED_SET_SENTENCE}`,
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    breakpoints: z.array(BREAKPOINT_ITEM).min(1).describe(BREAKPOINTS_WORDS),
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleDebugSetBreakpoints(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () =>
      requireDebugger(context, args, 'use').abap.setBreakpoints(
        breakpointsFromArgs(args.breakpoints),
      ),
    (v) => v,
  );
}
