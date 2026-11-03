import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugTerminate.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugStateAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugTerminate',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Ends the stopped debuggee and its program where it stands.',
  inputSchema: z.object({ ...STATE_HANDLE_PROPERTY, ...DETAIL_SHAPE }),
} as const;

export async function handleDebugTerminate(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugStateAnswer(args, async () =>
    requireDebugger(context, args, 'use').abap.terminate(),
  );
}
