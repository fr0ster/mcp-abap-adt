/**
 * `HandlerBatch`: batch mode in the compact sets, one tool for the three
 * actions — `begin`, `end`, `answers` — each as the full set's tool of the
 * same meaning (`BatchBegin`, `BatchEnd`, `BatchAnswers`). `number` /
 * `numbers` go with `answers` alone; given with another action, the call is
 * refused before anything runs.
 *
 * `begin` and `answers` work on no connection of the instance: the
 * dispatch reads the action before it takes one (`batchActionIsConnectionless`),
 * as it reads a long tool's arguments. `end` takes the instance's connection
 * in its turn.
 */
import { asksNumbers } from '../../batch/batchTools';
import { answersOf, beginBatch, endBatch } from '../../batch/tools';
import type { ArgsOf, HandlerContext } from '../../handlers/index';

/**
 * `HandlerBatch`'s description: the same sentences, one per action, naming
 * the actions where the full set names a tool.
 */
export const HANDLER_BATCH_DESCRIPTION = `[read-only] ${[
  "action 'begin': Starts batch mode on this server. In batch mode each call of a tool marked recordable is recorded under the next number, starting at 1, and answers with empty content. Answers the state_handle, which HTTP clients send in the x-mcp-state-handle header with every call of the batch.",
  "action 'end': Sends the recorded calls in one envelope with the credentials in force and ends batch mode. Splits SAP's answer into each call's parts and answers the number of recorded calls, of requests sent and of parts received; when sending fails, the parts received differ from the requests sent or the answer fails to split, answers that error, and every number of the batch then answers it.",
  "action 'answers' (with number or numbers): Answers the calls of the last executed batch by number: for each number asked, the tool's answer, built from the call's parts of SAP's response when the number is first read and kept for later reads; the numbers asked are processed in parallel. Takes one number or a list of numbers; an unknown number answers as unknown.",
].join(' ')}`;

export const TOOL_DEFINITION = {
  name: 'HandlerBatch',
  description: HANDLER_BATCH_DESCRIPTION,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['begin', 'end', 'answers'],
        description:
          "begin: switch into batch mode; end: send the recorded calls and leave batch mode; answers: read the last batch's answers by number (with number or numbers).",
      },
      number: {
        type: 'integer',
        minimum: 1,
        description:
          'answers only: one batch number to read (an integer of at least 1); give this or numbers, not both.',
      },
      numbers: {
        type: 'array',
        items: { type: 'integer', minimum: 1 },
        minItems: 1,
        description:
          'answers only: several batch numbers to read, answered in the order given; give this or number, not both.',
      },
    },
    required: ['action'],
  },
} as const;

/** `number` or `numbers` beside an action other than `answers`. */
export const NUMBER_WITHOUT_ANSWERS_WORDS =
  "number and numbers are given only with action 'answers'";

type BatchArgs = ArgsOf<typeof TOOL_DEFINITION.inputSchema>;

/**
 * Whether a `HandlerBatch` call works on no connection: every call but a
 * well-formed `end` — `begin` and `answers` never take one, and a call
 * refused for its arguments is refused before any is taken.
 */
export function batchActionIsConnectionless(args: unknown): boolean {
  const action =
    args !== null && typeof args === 'object'
      ? (args as { action?: unknown }).action
      : undefined;
  return action !== 'end' || asksNumbers(args);
}

export async function handleHandlerBatch(
  context: HandlerContext,
  args: BatchArgs,
) {
  if (args.action !== 'answers' && asksNumbers(args)) {
    throw new Error(NUMBER_WITHOUT_ANSWERS_WORDS);
  }
  switch (args.action) {
    case 'begin':
      return beginBatch(context);
    case 'end':
      return endBatch(context);
    case 'answers':
      return answersOf(context, args);
  }
}
