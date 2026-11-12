import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugGetStack.ts
import {
  debugBatchRecorder,
  requireDebugger,
} from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { terseStop } from '../../../lib/debugger/readings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugGetStack',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] [debug] Call stack of the stopped debuggee of the debug session named by state_handle, each frame with its ADT object address and its technical place. Needs a stopped debuggee.',
  inputSchema: z.object({ ...STATE_HANDLE_PROPERTY, ...DETAIL_SHAPE }),
} as const;

export async function handleDebugGetStack(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () => {
      const abap = requireDebugger(context, args, 'use').abap;
      const recorder = debugBatchRecorder(context);
      return recorder !== undefined
        ? abap.recordStack(recorder)
        : abap.getStack();
    },
    (stop) => terseStop(stop.debuggee, stop.stack, stop.attach),
  );
}
