import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import {
  AMDP_BREAKPOINTS_PROPERTY,
  amdpBreakpointsFromArgs,
  STATE_HANDLE_PROPERTY,
  USER_MODE_SENTENCE,
} from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'AmdpDebugSetBreakpoints',
  available_in: ['onprem', 'cloud'] as const,
  description: `[debug] Replaces the AMDP breakpoints of a debug session, as confirmed by the system. ${USER_MODE_SENTENCE}`,
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      ...AMDP_BREAKPOINTS_PROPERTY,
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'breakpoints'],
  },
} as const;

export async function handleAmdpDebugSetBreakpoints(
  context: HandlerContext,
  args: any,
) {
  return debugAnswer(
    args,
    () =>
      requireDebugger(context, args, 'use').amdp.setBreakpoints(
        amdpBreakpointsFromArgs(args.breakpoints),
      ),
    (v) => ({ breakpoints: v }),
  );
}
