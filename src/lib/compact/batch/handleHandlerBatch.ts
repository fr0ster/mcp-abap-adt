import * as z from 'zod';
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
import type { HandlerContext } from '../../handlers/index';
import { listedValues } from '../../handlers/listedValues';
import { child } from '../../xml/tree';
import { textsOf } from '../memberTexts';

/** `HandlerBatch`'s actions. */
export const BATCH_ACTIONS = ['begin', 'end', 'answers'] as const;
type BatchAction = (typeof BATCH_ACTIONS)[number];

/** Each action's sentence of the description: the full set's tool of its meaning. */
const ACTION_SENTENCES: ReadonlyArray<readonly [BatchAction, string]> = [
  [
    'begin',
    "action 'begin': Starts batch mode on this server. In batch mode each call of a tool marked recordable is recorded under the next number, starting at 1, and answers with empty content. Answers the state_handle: over Streamable HTTP send it as the state_handle argument of every call of the batch (or in the x-mcp-state-handle header).",
  ],
  [
    'end',
    "action 'end': Sends the recorded calls in one envelope with the credentials in force and ends batch mode. Splits SAP's answer into each call's parts and answers the number of recorded calls, of requests sent and of parts received; when sending fails, the parts received differ from the requests sent or the answer fails to split, answers that error, and every number of the batch then answers it.",
  ],
  [
    'answers',
    "action 'answers' (with number or numbers): Answers the calls of the last executed batch by number: for each number asked, the tool's answer, built from the call's parts of SAP's response when the number is first read and kept for later reads; the numbers asked are processed in parallel. Takes one number or a list of numbers; an unknown number answers as unknown.",
  ],
];

/** Each action's words in `action`'s description. */
const ACTION_WORDS: ReadonlyArray<readonly [BatchAction, string]> = [
  ['begin', 'begin: switch into batch mode'],
  ['end', 'end: send the recorded calls and leave batch mode'],
  [
    'answers',
    "answers: read the last batch's answers by number (with number or numbers)",
  ],
];

const NUMBER_PROPERTIES = {
  number: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'answers only: one batch number to read (an integer of at least 1); give this or numbers, not both.',
    ),
  numbers: z
    .array(z.number().int().min(1))
    .min(1)
    .optional()
    .describe(
      'answers only: several batch numbers to read, answered in the order given; give this or number, not both.',
    ),
};

/**
 * `HandlerBatch`'s description and schema with `actions`: each text names
 * only the actions given; `number` / `numbers` go with `answers` alone.
 */
export function handlerBatchDefinition(actions: readonly BatchAction[]) {
  return {
    description: `[read-only] ${textsOf(actions, ACTION_SENTENCES).join(' ')}`,
    inputSchema: z.object({
      action: listedValues(actions).describe(
        `${textsOf(actions, ACTION_WORDS).join('; ')}.`,
      ),
      ...(actions.includes('answers') ? NUMBER_PROPERTIES : {}),
    }),
  };
}

const ALL = handlerBatchDefinition(BATCH_ACTIONS);

/** `HandlerBatch`'s description with every action. */
export const HANDLER_BATCH_DESCRIPTION = ALL.description;

export const TOOL_DEFINITION = {
  name: 'HandlerBatch',
  description: HANDLER_BATCH_DESCRIPTION,
  inputSchema: z.object({
    action: listedValues(BATCH_ACTIONS).describe(
      `${textsOf(BATCH_ACTIONS, ACTION_WORDS).join('; ')}.`,
    ),
    ...NUMBER_PROPERTIES,
  }),
} as const;

/** `number` or `numbers` beside an action other than `answers`. */
export const NUMBER_WITHOUT_ANSWERS_WORDS =
  "number and numbers are given only with action 'answers'";

type BatchArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * Whether a `HandlerBatch` call works on no connection: every call but a
 * well-formed `end` — `begin` and `answers` never take one, and a call
 * refused for its arguments is refused before any is taken.
 */
export function batchActionIsConnectionless(args: unknown): boolean {
  const action = child(args, 'action');
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
