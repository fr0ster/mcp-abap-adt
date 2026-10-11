// src/handlers/debugger/debug/handleDebugTakeOverListener.ts
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
  SHARED_SET_SENTENCE,
  START_BREAKPOINTS_PROPERTY,
  START_NEEDS_BREAKPOINTS_SENTENCE,
  START_PROPERTIES,
  startOptionsFromArgs,
  TAKE_OVER_SENTENCE,
  USER_MODE_SENTENCE,
} from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugTakeOverListener',
  available_in: ['onprem', 'cloud'] as const,
  description: `[debug] Opens a debug session: arms breakpoints, listens for a debuggee and attaches the first one caught. ${TAKE_OVER_SENTENCE} ${START_NEEDS_BREAKPOINTS_SENTENCE} Takes whose requests are caught, the debugging mode and the debugger settings. ${USER_MODE_SENTENCE} ${SHARED_SET_SENTENCE}`,
  inputSchema: {
    type: 'object',
    properties: {
      ...START_BREAKPOINTS_PROPERTY,
      ...START_PROPERTIES,
      ...RUN_PROPERTY,
      ...DETAIL_PROPERTY,
    },
    required: ['breakpoints'],
  },
} as const;

export async function handleDebugTakeOverListener(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugStateAnswer(
    args,
    async () => {
      const d = requireDebugger(context, args, { create: 'abap' });
      // The boundary refuses a missing or empty list; a direct caller reaches the
      // session, which refuses it before the wire.
      return d.abap.start('takeOver', {
        breakpoints: breakpointsFromArgs(args.breakpoints ?? []),
        run: runFromArgs(args.run),
        ...startOptionsFromArgs(args),
      });
    },
    () => startedExtra(context),
    () => heldStateHandle(context),
  );
}
