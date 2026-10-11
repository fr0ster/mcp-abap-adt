// src/handlers/debugger/debug/handleDebugGetStack.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { terseStop } from '../../../lib/debugger/readings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugGetStack',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Call stack of the stopped debuggee, each frame as an object address and as its technical place. Needs a stopped debuggee.',
  inputSchema: {
    type: 'object',
    properties: { ...STATE_HANDLE_PROPERTY, ...DETAIL_PROPERTY },
    required: ['state_handle'],
  },
} as const;

export async function handleDebugGetStack(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () => requireDebugger(context, args, 'use').abap.getStack(),
    (stop) => terseStop(stop.debuggee, stop.stack, stop.attach),
  );
}
