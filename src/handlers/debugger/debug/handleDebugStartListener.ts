// src/handlers/debugger/debug/handleDebugStartListener.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugStateAnswer } from '../../../lib/debugger/answer';
import {
  BREAKPOINTS_PROPERTY,
  breakpointsFromArgs,
  RUN_PROPERTY,
  runFromArgs,
  USER_MODE_SENTENCE,
} from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugStartListener',
  available_in: ['onprem', 'cloud'] as const,
  description: `[debug] Opens a debug session of the connected SAP user: arms breakpoints, listens for a debuggee and attaches the first one caught; refused while another debugger listens for that user. ${USER_MODE_SENTENCE}`,
  inputSchema: {
    type: 'object',
    properties: {
      ...BREAKPOINTS_PROPERTY,
      ...RUN_PROPERTY,
      ...DETAIL_PROPERTY,
    },
  },
} as const;

export async function handleDebugStartListener(
  context: HandlerContext,
  args: any,
) {
  return debugStateAnswer(
    args,
    async () => {
      const d = requireDebugger(context, args, { create: 'abap' });
      return d.abap.start('refuse', {
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
