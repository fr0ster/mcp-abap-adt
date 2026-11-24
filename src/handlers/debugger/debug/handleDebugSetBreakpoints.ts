import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugSetBreakpoints.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import {
  BREAKPOINT_ITEM,
  BREAKPOINTS_WORDS,
  breakpointsFromArgs,
  STATE_HANDLE_PROPERTY,
} from '../../../lib/debugger/schemas';
import { purpose, toolDescription } from '../../../lib/description';
import { BREAKPOINTS_SET } from '../../../lib/description/debugger';
import { runParts } from '../../../lib/description/runs';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugSetBreakpoints',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'debug',
      purpose: purpose(
        'Adds breakpoints to an ABAP debug session: at a source position, optionally conditional, on an exception class, an ABAP statement or a message.',
      ),
      result: BREAKPOINTS_SET,
    }),
  ),
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
