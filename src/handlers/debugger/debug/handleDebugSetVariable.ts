// src/handlers/debugger/debug/handleDebugSetVariable.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { terseVariables } from '../../../lib/debugger/readings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugSetVariable',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Sets a variable of the stopped debuggee. Needs a stopped debuggee.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      name: { type: 'string' },
      value: {
        type: 'string',
        description: 'New value; converted to the type by the system.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'name', 'value'],
  },
} as const;

export async function handleDebugSetVariable(
  context: HandlerContext,
  args: any,
) {
  return debugAnswer(
    args,
    async () =>
      requireDebugger(context, args, 'use').abap.setVariable(
        String(args.name),
        String(args.value),
      ),
    terseVariables,
  );
}
