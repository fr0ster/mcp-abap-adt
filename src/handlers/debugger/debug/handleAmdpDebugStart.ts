import * as z from 'zod';
import {
  debugState,
  heldStateHandle,
  requireDebugger,
} from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import {
  AMDP_BREAKPOINTS_PROPERTY,
  amdpBreakpointsFromArgs,
  RUN_PROPERTY,
  runFromArgs,
} from '../../../lib/debugger/schemas';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'AmdpDebugStart',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'debug',
      purpose: purpose(
        'Opens an AMDP debug session of the connected SAP user with breakpoints in SQLScript methods, starting a background run once they are confirmed.',
      ),
    }),
  ),
  inputSchema: z.object({
    stop_existing: z
      .boolean()
      .default(false)
      .optional()
      .describe('Ends an AMDP debug session of this user left behind.'),
    ...AMDP_BREAKPOINTS_PROPERTY,
    ...RUN_PROPERTY,
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleAmdpDebugStart(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () => {
      const d = requireDebugger(context, args, { create: 'amdp' });
      const r = await d.amdp.start({
        stopExisting: args.stop_existing ?? false,
        breakpoints: amdpBreakpointsFromArgs(args.breakpoints),
        run: runFromArgs(args.run),
      });
      return { value: r, raw: JSON.stringify(r) };
    },
    (v) => v,
    (v) => v,
    () => ({ state_handle: debugState(context).handle }),
    () => heldStateHandle(context),
  );
}
