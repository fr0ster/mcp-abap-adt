import {
  debugBatchRecorder,
  requireDebugger,
} from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'AmdpDebugGetTable',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] [debug] Rows of a table variable at the AMDP stop, up to 100; optionally through a SELECT over it.',
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
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  // Recorded in the debugger batch: the data preview's own request.
  const recorder = debugBatchRecorder(context);
  return debugAnswer(
    args,
    async () => {
      // A blank name is a value the schema admits; it names no variable.
      if (!args.variable.trim())
        throw new Error('variable: the name of a table variable');
      const amdp = requireDebugger(context, args, 'use').amdp;
      return recorder !== undefined
        ? amdp.recordTable(recorder, args.variable, args.query || undefined)
        : amdp.getTable(args.variable, args.query || undefined);
    },
    (v) => v.rows,
  );
}
