// src/handlers/debugger/debug/handleDebugListWatchpoints.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { readXmlDocument } from '../../../lib/debugger/memoryReadings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugListWatchpoints',
  available_in: ['onprem', 'cloud'] as const,
  description: '[debug] Watchpoints of the stopped debuggee.',
  inputSchema: {
    type: 'object',
    properties: { ...STATE_HANDLE_PROPERTY, ...DETAIL_PROPERTY },
    required: ['state_handle'],
  },
} as const;

export async function handleDebugListWatchpoints(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () => requireDebugger(context, args, 'use').abap.listWatchpoints(),
    readXmlDocument,
    readXmlDocument,
  );
}
