import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugDeleteWatchpoint.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugDeleteWatchpoint',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'debug',
      purpose: purpose(
        'Deletes a watchpoint of the stopped ABAP debuggee by its id.',
      ),
    }),
  ),
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    watchpoint_id: z.string().describe('Watchpoint id.'),
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleDebugDeleteWatchpoint(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () => {
      await requireDebugger(context, args, 'use').abap.deleteWatchpoint(
        args.watchpoint_id,
      );
      return { value: { deleted: args.watchpoint_id }, raw: '' };
    },
    (v) => v,
  );
}
