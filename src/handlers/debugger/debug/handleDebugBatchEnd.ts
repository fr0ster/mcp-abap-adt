// src/handlers/debugger/debug/handleDebugBatchEnd.ts
import { endDebugBatch } from '../../../lib/batch/tools';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugBatchEnd',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[debug] Sends the recorded calls of the stopped debuggee in one envelope on the session the batch started on — the ABAP debuggee's session, or the AMDP session's command session — and ends the debugger batch. Answers the number of recorded calls, the numbers whose answer is an error, and SAP's answer to the envelope when the envelope failed.",
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
} as const;

/**
 * Sends the open debugger batch on the connection it was opened on and ends it,
 * whatever happens; the answers are kept by number. A failure it knows is
 * thrown: the dispatch answers it.
 */
export async function handleDebugBatchEnd(
  context: HandlerContext,
  _args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return endDebugBatch(context);
}
