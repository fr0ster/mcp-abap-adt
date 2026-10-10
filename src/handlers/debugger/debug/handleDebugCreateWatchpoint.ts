// src/handlers/debugger/debug/handleDebugCreateWatchpoint.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { readXmlDocument } from '../../../lib/debugger/memoryReadings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugCreateWatchpoint',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Watches a variable of the stopped debuggee: it stops when the variable changes, optionally under a condition.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      name: {
        type: 'string',
        description: 'Variable to watch; a path reaches a component.',
      },
      condition: {
        type: 'string',
        description: 'Stops only when this ABAP condition holds.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'name'],
  },
} as const;

export async function handleDebugCreateWatchpoint(
  context: HandlerContext,
  args: any,
) {
  return debugAnswer(
    args,
    async () =>
      requireDebugger(context, args, 'use').abap.createWatchpoint(
        String(args.name),
        args.condition ? String(args.condition) : undefined,
      ),
    readXmlDocument,
    readXmlDocument,
  );
}
