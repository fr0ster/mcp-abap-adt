import * as z from 'zod';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { openLongSession } from '../../../lib/longSession/tools';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'SessionOpen',
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        'Opens a long session on this server, keeping its server instance and SAP connection for every call that carries its state handle.',
      ),
    }),
  ),
  inputSchema: z.object({}),
} as const;

/** Opens the instance's long session; answers `{ state_handle }`. Works on no connection. */
export async function handleSessionOpen(
  context: HandlerContext,
  _args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return openLongSession(context);
}
