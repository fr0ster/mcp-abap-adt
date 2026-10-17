import { answersOf } from '../../../lib/batch/tools';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'BatchAnswers',
  description:
    "The answers of the last batch, by number: each is the answer the tool gives for that call, built when BatchEnd sent it — SAP's answer or why it was not sent. A number the last batch does not have answers: no answer with that number.",
  inputSchema: {
    type: 'object',
    properties: {
      number: {
        type: 'integer',
        minimum: 1,
        description:
          'One batch number to read (an integer of at least 1); give this or numbers, not both.',
      },
      numbers: {
        type: 'array',
        items: { type: 'integer', minimum: 1 },
        minItems: 1,
        description:
          'Several batch numbers to read, answered in the order given; give this or number, not both.',
      },
    },
    required: [],
  },
} as const;

/** The kept answers of the last batch, by number; nothing is sent. Works on no connection. */
export async function handleBatchAnswers(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answersOf(context, args);
}
