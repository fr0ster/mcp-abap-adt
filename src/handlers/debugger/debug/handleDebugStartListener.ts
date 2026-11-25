import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugStartListener.ts
import {
  heldStateHandle,
  requireDebugger,
  startedExtra,
} from '../../../lib/debugger/access';
import { debugStateAnswer } from '../../../lib/debugger/answer';
import {
  breakpointsFromArgs,
  RUN_PROPERTY,
  runFromArgs,
  START_BREAKPOINTS_PROPERTY,
  START_PROPERTIES,
  startOptionsFromArgs,
} from '../../../lib/debugger/schemas';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugStartListener',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'debug',
      purpose: purpose(
        'Starts an ABAP debug session: arms breakpoints, listens for a debuggee and attaches the first one caught.',
      ),
    }),
  ),
  inputSchema: z.object({
    ...START_BREAKPOINTS_PROPERTY,
    ...START_PROPERTIES,
    ...RUN_PROPERTY,
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleDebugStartListener(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugStateAnswer(
    args,
    async () => {
      const d = requireDebugger(context, args, { create: 'abap' });
      // The boundary refuses a missing or empty list; the session refuses an empty
      // one before the wire too.
      return d.abap.start('refuse', {
        breakpoints: breakpointsFromArgs(args.breakpoints),
        run: runFromArgs(args.run),
        ...startOptionsFromArgs(args),
      });
    },
    () => startedExtra(context),
    () => heldStateHandle(context),
  );
}
