// src/handlers/debugger/debug/handleDebugBatchBegin.ts
import { beginDebugBatch } from '../../../lib/batch/tools';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugBatchBegin',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] [debug] Starts the debugger batch on the stopped ABAP debuggee, else at the AMDP break. In the debugger batch each call of step, step to line, stack, variables, child variables, stack position or setting a variable at the ABAP debuggee, and of step over, continue or the data preview of a table variable at the AMDP break, is recorded under the next number, starting at 1, and answers with empty content. Answers the state_handle: over Streamable HTTP send it as the state_handle argument of every call of the batch (or in the x-mcp-state-handle header).',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
} as const;

/** Opens the debugger batch on the ABAP stop's connection or the AMDP session's command connection; answers `{ debug_batch: 'on', state_handle }`. */
export async function handleDebugBatchBegin(
  context: HandlerContext,
  _args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return beginDebugBatch(context);
}
