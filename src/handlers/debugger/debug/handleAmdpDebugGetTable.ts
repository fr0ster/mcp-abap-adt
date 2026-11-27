import * as z from 'zod';
import {
  debugBatchRecorder,
  requireDebugger,
} from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { purpose, toolDescription } from '../../../lib/description';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'AmdpDebugGetTable',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads the records of a table variable at the AMDP stop, up to the number asked, through a SELECT over it when one is set.',
    ),
  }),
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    variable: z.string().describe('The table variable to read.'),
    query: z.string().optional().describe('A SELECT over the variable.'),
    // No bound of the server's (#391): absent, the request carries none.
    row_number: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("How many records SAP answers; SAP's own count when omitted."),
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleAmdpDebugGetTable(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
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
        ? amdp.recordTable(
            recorder,
            args.variable,
            args.query || undefined,
            args.row_number,
          )
        : amdp.getTable(
            args.variable,
            args.query || undefined,
            args.row_number,
          );
    },
    (v) => v.rows,
  );
}
