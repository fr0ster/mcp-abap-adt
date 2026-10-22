import type { ArgsOf } from '../../../lib/handlers/argsOf';
import {
  CLOSE_SESSION_WORDS,
  closeLongSession,
} from '../../../lib/longSession/tools';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'SessionClose',
  description: `[read-only] ${CLOSE_SESSION_WORDS}`,
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
} as const;

/** Asks for the instance's close; answers `{ closed, held }`. Works on no connection. */
export async function handleSessionClose(
  context: HandlerContext,
  _args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return closeLongSession(context);
}
