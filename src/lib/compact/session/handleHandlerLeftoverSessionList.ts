import * as z from 'zod';
import { TOOL_DEFINITION as ListLeftoverSessions } from '../../../handlers/leftover_session/session/handleListLeftoverSessions';
import { compactOf } from '../../description/index';
import type { HandlerContext } from '../../handlers/index';
import { answerLeftoverList } from '../../leftoverSessions/answers';

export const TOOL_DEFINITION = {
  name: 'HandlerLeftoverSessionList',
  description: compactOf(ListLeftoverSessions.description),
  inputSchema: z.object({}),
} as const;

export async function handleHandlerLeftoverSessionList(
  context: HandlerContext,
  _args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerLeftoverList(context);
}
