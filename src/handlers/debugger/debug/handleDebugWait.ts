// src/handlers/debugger/debug/handleDebugWait.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugStateAnswer } from '../../../lib/debugger/answer';
import {
  HOLD_SECONDS_PROPERTY,
  STATE_HANDLE_PROPERTY,
} from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugWait',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[debug] State of a debug session after waiting up to hold_seconds; a debugger that took the user over is an error carrying the system's message.",
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      ...HOLD_SECONDS_PROPERTY,
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle'],
  },
} as const;

export async function handleDebugWait(context: HandlerContext, args: any) {
  return debugStateAnswer(args, async () => {
    const d = requireDebugger(context, args, 'use');
    const seconds =
      args.hold_seconds === undefined ? 10 : Number(args.hold_seconds);
    // A value that is no number would wait 0 ms and look like an answer: refuse it.
    if (!Number.isFinite(seconds))
      throw new Error('hold_seconds: a number of seconds');
    return d.abap.wait(seconds);
  });
}
