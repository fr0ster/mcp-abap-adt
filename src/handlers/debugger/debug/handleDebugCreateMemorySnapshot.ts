import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugCreateMemorySnapshot.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { readXmlDocument } from '../../../lib/debugger/memoryReadings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugCreateMemorySnapshot',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Writes a memory snapshot of the stopped debuggee and answers the file written.',
  inputSchema: z.object({ ...STATE_HANDLE_PROPERTY, ...DETAIL_SHAPE }),
} as const;

export async function handleDebugCreateMemorySnapshot(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () =>
      requireDebugger(context, args, 'use').abap.createMemorySnapshot(),
    readXmlDocument,
    readXmlDocument,
  );
}
