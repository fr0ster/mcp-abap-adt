import type { ArgsOf, HandlerContext } from '../../handlers/index';
import { answerLeftoverList } from '../../leftoverSessions/answers';

export const TOOL_DEFINITION = {
  name: 'HandlerLeftoverSessionList',
  description:
    "Lists the SAP sessions of this server's destination an ended server process left open (it was killed before logging them off): handle, role (built or debugger), destination, user, when recorded. Nothing is sent to SAP. Sessions of a running process are not listed. A server starting while exactly one built session of its destination is left is born on it; with several, none is taken.",
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
