import type { ArgsOf, HandlerContext } from '../../handlers/index';
import { answerLeftoverLogoff } from '../../leftoverSessions/answers';

export const TOOL_DEFINITION = {
  name: 'HandlerLeftoverSessionLogoff',
  description:
    'Logs off a leftover SAP session (any role), releasing every lock it holds; only the logoff is sent, with no credential. Its record is deleted afterwards.',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description:
          'The handle of a leftover session, as the list answers it.',
      },
    },
    required: ['handle'],
  },
} as const;

export async function handleHandlerLeftoverSessionLogoff(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerLeftoverLogoff(context, args.handle);
}
