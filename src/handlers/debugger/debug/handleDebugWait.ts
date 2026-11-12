import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugWait.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugStateAnswer } from '../../../lib/debugger/answer';
import {
  HOLD_SECONDS_PROPERTY,
  STATE_HANDLE_PROPERTY,
} from '../../../lib/debugger/schemas';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugWait',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[read-only] [debug] State of a debug session after waiting up to hold_seconds; a debugger that took the user over is an error carrying the system's message.",
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    ...HOLD_SECONDS_PROPERTY,
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleDebugWait(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugStateAnswer(args, async () => {
    return requireDebugger(context, args, 'use').abap.wait(
      args.hold_seconds ?? 10,
    );
  });
}
