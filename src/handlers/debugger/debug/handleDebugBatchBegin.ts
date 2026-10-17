// src/handlers/debugger/debug/handleDebugBatchBegin.ts
import { beginDebugBatch } from '../../../lib/batch/tools';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugBatchBegin',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Starts the debugger batch on the stopped debuggee. In the debugger batch each call of step, step to line, stack, variables, child variables, stack position or setting a variable is recorded under the next number, starting at 1, and answers with empty content. Answers the state_handle, which HTTP clients send in the x-mcp-state-handle header with every call of the batch.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
} as const;

/** Opens the debugger batch on the ABAP stop's connection; answers `{ debug_batch: 'on', state_handle }`. */
export async function handleDebugBatchBegin(
  context: HandlerContext,
  _args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return beginDebugBatch(context);
}
