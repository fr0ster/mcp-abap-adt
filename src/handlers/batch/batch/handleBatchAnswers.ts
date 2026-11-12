import * as z from 'zod';
import { answersOf } from '../../../lib/batch/tools';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'BatchAnswers',
  description:
    "[read-only] Answers the calls of the last executed batch by number: for each number asked, the tool's answer, built from the call's parts of SAP's response when the number is first read and kept for later reads; the numbers asked are processed in parallel. Takes one number or a list of numbers; an unknown number answers as unknown.",
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
export async function handleBatchAnswers(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answersOf(context, args);
}
