import * as z from 'zod';
import { answerLeftoverLogoff } from '../../../lib/leftoverSessions/answers';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'LogoffLeftoverSession',
  description:
    '[session] Logs off a leftover SAP session (any role): the session ends, and every lock it holds is released. Only the logoff is sent, credential-free. The session record is deleted afterwards.',
  inputSchema: z.object({
    handle: z
      .string()
      .describe(
        'The handle of a leftover session, as the list of leftover sessions answers it.',
      ),
  }),
} as const;

export async function handleLogoffLeftoverSession(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerLeftoverLogoff(context, args.handle);
}
