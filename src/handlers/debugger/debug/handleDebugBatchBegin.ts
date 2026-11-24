import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugBatchBegin.ts
import { beginDebugBatch } from '../../../lib/batch/tools';
import {
  purpose,
  stateHandleAnswered,
  toolDescription,
} from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugBatchBegin',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        'Starts recording the debugger calls at the stopped ABAP debuggee or at the AMDP break, each under the next number, to send them together.',
      ),
      notes: [stateHandleAnswered],
    }),
  ),
  inputSchema: z.object({}),
} as const;

/** Opens the debugger batch on the ABAP stop's connection or the AMDP session's command connection; answers `{ debug_batch: 'on', state_handle }`. */
export async function handleDebugBatchBegin(
  context: HandlerContext,
  _args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return beginDebugBatch(context);
}
