import * as z from 'zod';
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import {
  AMDP_BREAKPOINTS_PROPERTY,
  AMDP_CATCH_SENTENCE,
  amdpBreakpointsFromArgs,
  STATE_HANDLE_PROPERTY,
} from '../../../lib/debugger/schemas';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'AmdpDebugSetBreakpoints',
  available_in: ['onprem', 'cloud'] as const,
  description: `[debug] Sets the AMDP breakpoints of a debug session to the set given, as confirmed by the system. ${AMDP_CATCH_SENTENCE}`,
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    ...AMDP_BREAKPOINTS_PROPERTY,
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleAmdpDebugSetBreakpoints(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
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
