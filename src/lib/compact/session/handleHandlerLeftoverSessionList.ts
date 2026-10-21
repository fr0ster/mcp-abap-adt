import type { ArgsOf, HandlerContext } from '../../handlers/index';
import { answerLeftoverList } from '../../leftoverSessions/answers';

export const TOOL_DEFINITION = {
  name: 'HandlerLeftoverSessionList',
  description:
    "[read-only] Lists the SAP sessions of this server's destination an ended server process left open (it was killed before logging them off): handle, role (built or debugger), destination, user, when recorded. Read from the session records alone. Only sessions of ended processes are listed. A server starting while exactly one built session of its destination is left is born on it; with several, all stay listed and untaken.",
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
} as const;

export async function handleHandlerLeftoverSessionList(
  context: HandlerContext,
  _args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerLeftoverList(context);
}
