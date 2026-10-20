import { beginBatch } from '../../../lib/batch/tools';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'BatchBegin',
  description:
    '[read-only] Starts batch mode on this server. In batch mode each call of a tool marked recordable is recorded under the next number, starting at 1, and answers with empty content. Answers the state_handle, which HTTP clients send in the x-mcp-state-handle header with every call of the batch.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
} as const;

/** Opens a communication batch; answers `{ batch: 'on', state_handle }`. Works on no connection. */
export async function handleBatchBegin(
  context: HandlerContext,
  _args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return beginBatch(context);
}
