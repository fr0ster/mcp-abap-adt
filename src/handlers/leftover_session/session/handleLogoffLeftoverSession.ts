import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { answerLeftoverLogoff } from '../../../lib/leftoverSessions/answers';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'LogoffLeftoverSession',
  description:
    '[session] Logs off a leftover SAP session (any role): the session ends, and every lock it holds is released. No credential is sent with the logoff. The session record is deleted afterwards; a session SAP had already ended is reported as such.',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description:
          'The handle of a leftover session, as the list of leftover sessions answers it.',
      },
    },
    required: ['handle'],
  },
} as const;

export async function handleLogoffLeftoverSession(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerLeftoverLogoff(context, args.handle);
}
