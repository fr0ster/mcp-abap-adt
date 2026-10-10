// src/handlers/debugger/debug/handleDebugTakeOverListener.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugStateAnswer } from '../../../lib/debugger/answer';
import {
  BREAKPOINTS_PROPERTY,
  breakpointsFromArgs,
  RUN_PROPERTY,
  runFromArgs,
  TAKE_OVER_SENTENCE,
  USER_MODE_SENTENCE,
} from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugTakeOverListener',
  available_in: ['onprem', 'cloud'] as const,
  description: `[debug] Opens a debug session of the connected SAP user like a listener start, taking the user's debugging over. ${TAKE_OVER_SENTENCE} ${USER_MODE_SENTENCE}`,
  inputSchema: {
    type: 'object',
    properties: {
      ...BREAKPOINTS_PROPERTY,
      ...RUN_PROPERTY,
      ...DETAIL_PROPERTY,
    },
  },
} as const;

export async function handleDebugTakeOverListener(
  context: HandlerContext,
  args: any,
) {
  return debugStateAnswer(
    args,
    async () => {
      const d = requireDebugger(context, args, { create: 'abap' });
      return d.abap.start('takeOver', {
        ...(args.breakpoints
          ? { breakpoints: breakpointsFromArgs(args.breakpoints) }
          : {}),
        run: runFromArgs(args.run),
      });
    },
    () => ({
      state_handle: context.state!.handle,
      terminal_id: context.debugger!().abap.ids.terminalId,
      ide_id: context.debugger!().abap.ids.ideId,
    }),
  );
}
