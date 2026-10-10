// src/handlers/debugger/debug/handleDebugCreateMemorySnapshot.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { readXmlDocument } from '../../../lib/debugger/memoryReadings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugCreateMemorySnapshot',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Writes a memory snapshot of the stopped debuggee and answers the file written.',
  inputSchema: {
    type: 'object',
    properties: { ...STATE_HANDLE_PROPERTY, ...DETAIL_PROPERTY },
    required: ['state_handle'],
  },
} as const;

export async function handleDebugCreateMemorySnapshot(
  context: HandlerContext,
  args: any,
) {
  return debugAnswer(
    args,
    async () =>
      requireDebugger(context, args, 'use').abap.createMemorySnapshot(),
    readXmlDocument,
    readXmlDocument,
  );
}
