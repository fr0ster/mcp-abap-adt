import * as z from 'zod';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { LEFTOVER_SESSIONS } from '../../../lib/description/sessions';
import { answerLeftoverList } from '../../../lib/leftoverSessions/answers';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'ListLeftoverSessions',
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        "Lists the SAP sessions of this server's destination left open by an ended server process, which may still hold locks.",
      ),
      result: LEFTOVER_SESSIONS,
    }),
  ),
  inputSchema: z.object({}),
} as const;

export async function handleListLeftoverSessions(
  context: HandlerContext,
  _args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerLeftoverList(context);
}
