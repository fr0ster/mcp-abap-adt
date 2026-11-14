import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugCreateWatchpoint.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { readXmlDocument } from '../../../lib/debugger/memoryReadings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugCreateWatchpoint',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Watches a variable of the stopped debuggee: it stops when the variable changes, optionally under a condition.',
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    name: z.string().describe('Variable to watch; a path reaches a component.'),
    condition: z
      .string()
      .optional()
      .describe('Stops only when this ABAP condition holds.'),
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleDebugCreateWatchpoint(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () =>
      requireDebugger(context, args, 'use').abap.createWatchpoint(
        args.name,
        args.condition || undefined,
      ),
    readXmlDocument,
    readXmlDocument,
  );
}
