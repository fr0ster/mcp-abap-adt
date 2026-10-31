// src/handlers/debugger/debug/handleDebugSetBreakpoints.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import {
  BREAKPOINTS_PROPERTY,
  breakpointsFromArgs,
  SHARED_SET_SENTENCE,
  STATE_HANDLE_PROPERTY,
} from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugSetBreakpoints',
  available_in: ['onprem', 'cloud'] as const,
  description: `[debug] Adds breakpoints to a debug session — a line, an exception class, an ABAP statement or a message; a line breakpoint may carry a condition — and answers the whole set placed, this call's refusals each with its breakpoint and reason, earlier breakpoints that dropped out of the set, and any answer row left unpaired with a breakpoint. ${SHARED_SET_SENTENCE}`,
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      breakpoints: { ...BREAKPOINTS_PROPERTY.breakpoints, minItems: 1 },
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'breakpoints'],
  },
} as const;

export async function handleDebugSetBreakpoints(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
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
