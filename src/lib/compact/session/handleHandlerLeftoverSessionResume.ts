import type { ArgsOf, HandlerContext } from '../../handlers/index';
import { answerLeftoverResume } from '../../leftoverSessions/answers';

export const TOOL_DEFINITION = {
  name: 'HandlerLeftoverSessionResume',
  description:
    "Continues a leftover SAP session (role built only) as this server's connection instead of a logon, so its locks and lock handles work again. Only before the server has connected to SAP: refused once it has a connection, which is never replaced. Nothing is checked or repaired after it: an ended session or lost locks show in SAP's answers, and the requests are yours to redo. If SAP answers the session is gone, its record is deleted and the next call logs on.",
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
