import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugSetStackPosition.ts
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
  name: 'DebugSetStackPosition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Selects the stack frame variables are read in; execution goes on from the same point. Needs a stopped debuggee.',
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    position: z
      .number()
      .int()
      .describe(
        'Frame position as the stack numbers it; the stopped frame has the highest position.',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleDebugSetStackPosition(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const recorder = debugBatchRecorder(context);
  if (recorder !== undefined) {
    // Recorded in the debugger batch: the move's own request alone.
    return debugAnswer(
      args,
      async () =>
        requireDebugger(context, args, 'use').abap.recordStackPosition(
          recorder,
          args.position,
        ),
      (v) => v,
    );
  }
  return debugAnswer(
    args,
    async () =>
      requireDebugger(context, args, 'use').abap.setStackPosition(
        args.position,
      ),
    (s) => terseStop(s.debuggee, s.stack, s.attach),
  );
}
