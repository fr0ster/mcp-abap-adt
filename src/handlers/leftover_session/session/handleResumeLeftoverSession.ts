import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { answerLeftoverResume } from '../../../lib/leftoverSessions/answers';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'ResumeLeftoverSession',
  description:
    "[session] Continues a leftover SAP session (role built only) as this server's own connection instead of a logon: the locks it holds and their lock handles work again, so an object locked there can be finished or unlocked. Possible only before this server has connected to SAP — call it before any other SAP tool; once the server has a connection, the resume is refused and nothing is replaced. If SAP answers that the old session has ended (much time passed), a new session is started with the normal logon instead, and its locks are gone. Either way the answer is resumed, with session picked_up or new, and the record stays this server's. The server checks and repairs nothing after a resume: a session that ended or locks that are gone show in SAP's answers, and the requests are yours to redo. Any other failure (the credential refused, SAP unreachable) is the error, as SAP gave it.",
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
