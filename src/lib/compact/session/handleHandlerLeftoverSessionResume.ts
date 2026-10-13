import type { ArgsOf, HandlerContext } from '../../handlers/index';
import { answerLeftoverResume } from '../../leftoverSessions/answers';

export const TOOL_DEFINITION = {
  name: 'HandlerLeftoverSessionResume',
  description:
    "Continues a leftover SAP session (role built only) as this server's connection, without a new logon, so its locks and lock handles work again. A session already held here ends with its logoff once unused. If SAP answers the session is gone, the answer is SAP's and its record is deleted.",
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

export async function handleHandlerLeftoverSessionResume(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerLeftoverResume(context, args.handle);
}
