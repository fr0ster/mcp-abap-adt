import type { ArgsOf } from '../../../lib/handlers/argsOf';
import {
  OPEN_SESSION_WORDS,
  openLongSession,
} from '../../../lib/longSession/tools';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'SessionOpen',
  description: `[read-only] ${OPEN_SESSION_WORDS}`,
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
} as const;

/** Opens the instance's long session; answers `{ state_handle }`. Works on no connection. */
export async function handleSessionOpen(
  context: HandlerContext,
  _args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return openLongSession(context);
}
