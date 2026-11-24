import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugCreateWatchpoint.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { readXmlDocument } from '../../../lib/debugger/memoryReadings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import {
  purpose,
  toolDescription,
  untypedReturns,
} from '../../../lib/description';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugCreateWatchpoint',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'debug',
    purpose: purpose(
      'Watches a variable of the stopped ABAP debuggee, stopping it when the variable changes, under a condition when one is set.',
    ),
    returns: untypedReturns(),
  }),
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
