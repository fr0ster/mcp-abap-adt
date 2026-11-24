import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugBatchAnswers.ts
import { answersOf } from '../../../lib/batch/tools';
import { purpose, toolDescription } from '../../../lib/description';
import { RECORDED_OUTCOMES } from '../../../lib/description/debugger';
import { runParts } from '../../../lib/description/runs';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugBatchAnswers',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        'Reads the outcome of each recorded debugger call of the last sending, by its number.',
      ),
      result: RECORDED_OUTCOMES,
    }),
  ),
  inputSchema: z.object({
    number: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'One batch number to read (an integer of at least 1); give this or numbers, not both.',
      ),
    numbers: z
      .array(z.number().int().min(1))
      .min(1)
      .optional()
      .describe(
        'Several batch numbers to read, answered in the order given; give this or number, not both.',
      ),
  }),
} as const;

/** The kept answers of the last batch, by number; nothing is sent. Works on no connection. */
export async function handleDebugBatchAnswers(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answersOf(context, args);
}
