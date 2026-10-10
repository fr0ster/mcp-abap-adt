// src/handlers/debugger/debug/handleDebugSetBreakpoints.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import {
  BREAKPOINTS_PROPERTY,
  breakpointsFromArgs,
  STATE_HANDLE_PROPERTY,
  USER_MODE_SENTENCE,
} from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugSetBreakpoints',
  available_in: ['onprem', 'cloud'] as const,
  description: `[debug] Adds breakpoints to a debug session — line, exception class, ABAP statement or message, with an optional condition — and reports which the system refused and why. ${USER_MODE_SENTENCE}`,
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      ...BREAKPOINTS_PROPERTY,
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle'],
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
