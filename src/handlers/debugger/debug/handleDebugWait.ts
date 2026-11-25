import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugWait.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugStateAnswer } from '../../../lib/debugger/answer';
import {
  HOLD_SECONDS_PROPERTY,
  STATE_HANDLE_PROPERTY,
} from '../../../lib/debugger/schemas';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugWait',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        'Waits for the next stop or end of an ABAP debug session, up to the seconds asked, and tells its state.',
      ),
    }),
  ),
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
