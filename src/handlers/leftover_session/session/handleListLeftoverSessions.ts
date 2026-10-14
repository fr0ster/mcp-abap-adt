import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { answerLeftoverList } from '../../../lib/leftoverSessions/answers';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'ListLeftoverSessions',
  description:
    "[session] Lists the SAP sessions of this server's destination that an ended server process left open (it was killed before it could log them off), with the locks they may hold: handle, role (built: an instance connection; debugger: a debug session connection), destination, user (none for a token login) and when it was last recorded. Read from the session records alone: nothing is sent to SAP. Sessions of a running process are not listed. Resume one or log it off by its handle; nothing happens to them otherwise.",
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
