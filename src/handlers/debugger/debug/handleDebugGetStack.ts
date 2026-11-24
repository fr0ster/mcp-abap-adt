import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugGetStack.ts
import {
  debugBatchRecorder,
  requireDebugger,
} from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { terseStop } from '../../../lib/debugger/readings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { purpose, toolDescription } from '../../../lib/description';
import { STOP } from '../../../lib/description/debugger';
import { runParts } from '../../../lib/description/runs';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugGetStack',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        'Reads the call stack of the stopped ABAP debuggee, each frame with its ADT object address and its place in the source.',
      ),
      result: STOP,
    }),
  ),
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
