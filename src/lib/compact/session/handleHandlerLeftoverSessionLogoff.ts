import * as z from 'zod';
import { TOOL_DEFINITION as LogoffLeftoverSession } from '../../../handlers/leftover_session/session/handleLogoffLeftoverSession';
import { compactOf } from '../../description/index';
import type { HandlerContext } from '../../handlers/index';
import { answerLeftoverLogoff } from '../../leftoverSessions/answers';

export const TOOL_DEFINITION = {
  name: 'HandlerLeftoverSessionLogoff',
  description: compactOf(LogoffLeftoverSession.description),
  inputSchema: z.object({
    handle: z
      .string()
      .describe('The handle of a leftover session, as the list answers it.'),
  }),
} as const;

export async function handleHandlerLeftoverSessionLogoff(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerLeftoverLogoff(context, args.handle);
}
