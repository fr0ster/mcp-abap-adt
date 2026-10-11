// src/handlers/debugger/debug/handleDebugDeleteWatchpoint.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugDeleteWatchpoint',
  available_in: ['onprem', 'cloud'] as const,
  description: '[debug] Removes a watchpoint.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      watchpoint_id: { type: 'string', description: 'Watchpoint id.' },
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'watchpoint_id'],
  },
} as const;

export async function handleDebugDeleteWatchpoint(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
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
