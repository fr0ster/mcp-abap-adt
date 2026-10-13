import type { ArgsOf, HandlerContext } from '../../handlers/index';
import { answerLeftoverList } from '../../leftoverSessions/answers';

export const TOOL_DEFINITION = {
  name: 'HandlerLeftoverSessionList',
  description:
    'Lists your SAP sessions an ended server process left open (it was killed before logging them off): handle, role (built or debugger), destination, user, when recorded. Sessions of a running process are not listed.',
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
