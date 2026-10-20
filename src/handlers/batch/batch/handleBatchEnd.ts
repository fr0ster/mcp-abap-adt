import { endBatch } from '../../../lib/batch/tools';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'BatchEnd',
  description:
    "Sends the recorded calls in one envelope with the credentials in force and ends batch mode. Answers the number of recorded calls, the numbers whose answer is an error, and SAP's answer to the envelope when the envelope failed.",
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
