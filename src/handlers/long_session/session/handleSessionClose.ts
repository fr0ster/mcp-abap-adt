import * as z from 'zod';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { closeLongSession } from '../../../lib/longSession/tools';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'SessionClose',
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        'Closes the long session a state handle names, logging off its SAP sessions and so releasing their locks.',
      ),
    }),
  ),
  inputSchema: z.object({}),
} as const;

/** Asks for the instance's close; answers `{ closed, held }`. Works on no connection. */
export async function handleSessionClose(
  context: HandlerContext,
  _args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return closeLongSession(context);
}
