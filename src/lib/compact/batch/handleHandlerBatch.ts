import * as z from 'zod';
/**
 * `HandlerBatch`: batch mode, served by the compact sets alone; one tool
 * for the three actions — `begin`, `end`, `answers`. `number` /
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
import { RECORDED_OUTCOMES, RECORDED_SENT } from '../../description/debugger';
import {
  type DescriptionParts,
  purpose,
  resultReturns,
  toolDescription,
  valueParts,
} from '../../description/index';
import { CALLS_RECORDING } from '../../description/sessions';
import type { HandlerContext, ToolArgs } from '../../handlers/index';
import { listedValues } from '../../handlers/listedValues';
import { textsOf } from '../memberTexts';

/** `HandlerBatch`'s actions. */
export const BATCH_ACTIONS = ['begin', 'end', 'answers'] as const;
type BatchAction = (typeof BATCH_ACTIONS)[number];

/** Each action by its function, and what it answers. */
const ACTION_VALUES = {
  begin: valueParts('begin', {
    purpose: purpose(
      'Starts recording the calls of the tools that allow it, each under the next number, to send them together.',
    ),
    returns: resultReturns(CALLS_RECORDING),
  }),
  end: valueParts('end', {
    purpose: purpose(
      "Sends the recorded calls to SAP together, with the credentials in force, and splits SAP's answer by call.",
    ),
    returns: resultReturns(RECORDED_SENT),
  }),
  answers: valueParts('answers', {
    purpose: purpose(
      'Reads the answer of each recorded call of the last sending, by its number.',
    ),
    returns: resultReturns(RECORDED_OUTCOMES),
  }),
} as const;

/** `HandlerBatch`'s parts with `actions`: each action by its function. */
export function handlerBatchParts(
  actions: readonly BatchAction[],
): DescriptionParts {
  return {
    tag: 'read-only',
    purpose: purpose(
      "Records the calls of the tools that allow it and sends them to SAP together, then reads each call's answer by its number.",
    ),
    returns: [],
    values: {
      of: 'action',
      each: actions.map((action) => ACTION_VALUES[action]),
    },
  };
}

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
    description: toolDescription(handlerBatchParts(actions)),
    inputSchema: z.object({
      action: listedValues(actions).describe(
        `${textsOf(actions, ACTION_WORDS).join('; ')}.`,
      ),
      ...(actions.includes('answers') ? NUMBER_PROPERTIES : {}),
    }),
  };
}

export const TOOL_DEFINITION = {
  name: 'HandlerBatch',
  description: toolDescription(handlerBatchParts(BATCH_ACTIONS)),
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
export function batchActionIsConnectionless(args: ToolArgs): boolean {
  return (
    args.action !== 'end' ||
    args.number !== undefined ||
    args.numbers !== undefined
  );
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
