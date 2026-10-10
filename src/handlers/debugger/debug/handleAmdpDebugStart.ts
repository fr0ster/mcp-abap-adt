import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import {
  AMDP_BREAKPOINTS_PROPERTY,
  amdpBreakpointsFromArgs,
  RUN_PROPERTY,
  runFromArgs,
  USER_MODE_SENTENCE,
} from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'AmdpDebugStart',
  available_in: ['onprem', 'cloud'] as const,
  description: `[debug] Opens an AMDP debug session of the connected SAP user with breakpoints on lines in SQLScript methods; a background run, when given, starts once the system confirmed the breakpoints. ${USER_MODE_SENTENCE}`,
  inputSchema: {
    type: 'object',
    properties: {
      stop_existing: {
        type: 'boolean',
        default: false,
        description: 'Ends an AMDP debug session of this user left behind.',
      },
      ...AMDP_BREAKPOINTS_PROPERTY,
      ...RUN_PROPERTY,
      ...DETAIL_PROPERTY,
    },
    required: ['breakpoints'],
  },
} as const;

export async function handleAmdpDebugStart(context: HandlerContext, args: any) {
  return debugAnswer(
    args,
    async () => {
      const d = requireDebugger(context, args, { create: 'amdp' });
      const r = await d.amdp.start({
        stopExisting: args.stop_existing === true,
        breakpoints: amdpBreakpointsFromArgs(args.breakpoints),
        run: runFromArgs(args.run),
      });
      return { value: r, raw: JSON.stringify(r) };
    },
    (v) => v,
    (v) => v,
    () => ({ state_handle: context.state!.handle }),
  );
}
