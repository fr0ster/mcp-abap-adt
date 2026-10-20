import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { answerLeftoverList } from '../../../lib/leftoverSessions/answers';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'ListLeftoverSessions',
  description:
    "[session] Lists the SAP sessions of this server's destination that an ended server process left open (it was killed before it could log them off), with the locks they may hold: handle, role (built: an instance connection; debugger: a debug session connection), destination, user (absent for a token login) and when it was last recorded. Read from the session records alone, on this machine. Only sessions of ended processes are listed. Log one off by its handle. A server process that starts while exactly one instance session (built) of its destination is left is born on it, before any tool call; with several, all stay here, untaken.",
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
} as const;

export async function handleListLeftoverSessions(
  context: HandlerContext,
  _args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerLeftoverList(context);
}
