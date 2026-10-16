import { endBatch } from '../../../lib/batch/tools';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'BatchEnd',
  description:
    'Sends every call recorded since BatchBegin, in parallel envelopes, with the credentials in force now, and leaves batch mode whatever happens; nothing is sent twice. Answers how many calls were recorded and which numbers failed; read each answer with BatchAnswers.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
} as const;

/**
 * Sends the open communication batch on the connection this call took, and
 * leaves batch mode whatever happens. A failure it knows is thrown: the
 * dispatch answers it, and ends the batch when it came before `execute()`.
 */
export async function handleBatchEnd(
  context: HandlerContext,
  _args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return endBatch(context);
}
