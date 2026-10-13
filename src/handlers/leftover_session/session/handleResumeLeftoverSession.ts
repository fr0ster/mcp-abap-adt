import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { answerLeftoverResume } from '../../../lib/leftoverSessions/answers';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'ResumeLeftoverSession',
  description:
    "[session] Continues a leftover SAP session (role built only) as this server's own connection, without a new logon: the locks it holds and their lock handles work again, so an object locked there can be finished or unlocked. A session this server already held is ended with its logoff once no call uses it. When SAP answers that the session is gone, the answer is SAP's and the session's record is deleted.",
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

export async function handleResumeLeftoverSession(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerLeftoverResume(context, args.handle);
}
