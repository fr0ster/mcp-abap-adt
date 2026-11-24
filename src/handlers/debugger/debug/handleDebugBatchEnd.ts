import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugBatchEnd.ts
import { endDebugBatch } from '../../../lib/batch/tools';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugBatchEnd',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'debug',
      purpose: purpose(
        "Sends the recorded debugger calls together on the session they were recorded on, and splits SAP's answer by call.",
      ),
    }),
  ),
  inputSchema: z.object({}),
} as const;

/**
 * Sends the open debugger batch on the connection it was opened on and ends it,
 * whatever happens; the answers are kept by number. A failure it knows is
 * thrown: the dispatch answers it.
 */
export async function handleDebugBatchEnd(
  context: HandlerContext,
  _args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return endDebugBatch(context);
}
