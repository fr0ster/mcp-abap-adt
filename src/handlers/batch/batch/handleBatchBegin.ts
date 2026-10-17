import { beginBatch } from '../../../lib/batch/tools';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'BatchBegin',
  description:
    "Switches this server into batch mode: from now on each call of a tool none of whose requests depends on another's answer is recorded instead of sent, and returns nothing. Every recorded call is numbered, in the order made, from 1. A tool that builds a request from an earlier answer is refused in batch mode; use the low-level tools (compact: HandlerCreate, HandlerLock, HandlerUpdate with lock_handle, HandlerUnlock, HandlerGet) and run each phase as its own batch. BatchEnd sends the recorded calls; read their answers by number with BatchAnswers. Over HTTP, send the state_handle this answers in the request header on every call of the batch.",
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
