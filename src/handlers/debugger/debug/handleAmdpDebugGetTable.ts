import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'AmdpDebugGetTable',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Rows of a table variable at the AMDP stop, up to 100; optionally through a SELECT over it.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      variable: {
        type: 'string',
        description: 'The table variable to read.',
      },
      query: { type: 'string', description: 'A SELECT over the variable.' },
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'variable'],
  },
} as const;

export async function handleAmdpDebugGetTable(
  context: HandlerContext,
  args: any,
) {
  return debugAnswer(
    args,
    async () => {
      if (typeof args.variable !== 'string' || !args.variable.trim())
        throw new Error('variable: the name of a table variable');
      return requireDebugger(context, args, 'use').amdp.getTable(
        args.variable,
        args.query ? String(args.query) : undefined,
      );
    },
    (v) => v.rows,
  );
}
