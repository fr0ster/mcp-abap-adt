import * as z from 'zod';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { LEFTOVER_LOGGED_OFF } from '../../../lib/description/sessions';
import { answerLeftoverLogoff } from '../../../lib/leftoverSessions/answers';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'LogoffLeftoverSession',
  description: toolDescription(
    runParts({
      purpose: purpose(
        'Logs off a leftover SAP session by its handle, releasing every lock it holds and deleting its record.',
      ),
      result: LEFTOVER_LOGGED_OFF,
    }),
  ),
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
