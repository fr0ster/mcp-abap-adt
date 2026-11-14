import * as z from 'zod';
/**
 * `HandlerDebugBatch`: the debugger batch in the compact set, one tool for
 * the three actions — `begin`, `end`, `answers` — each as the full set's
 * tool of the same meaning (`DebugBatchBegin`, `DebugBatchEnd`,
 * `BatchAnswers`). `number` / `numbers` go with `answers` alone; given with
 * another action, the call is refused before anything runs.
 */

import { TOOL_DEFINITION as DebugBatchBegin_Tool } from '../../../handlers/debugger/debug/handleDebugBatchBegin';
import { TOOL_DEFINITION as DebugBatchEnd_Tool } from '../../../handlers/debugger/debug/handleDebugBatchEnd';
import { asksNumbers } from '../../batch/batchTools';
import { answersOf, beginDebugBatch, endDebugBatch } from '../../batch/tools';
import type { HandlerContext } from '../../handlers/index';
import { listedValues } from '../../handlers/listedValues';
import { NUMBER_WITHOUT_ANSWERS_WORDS } from '../batch/handleHandlerBatch';
import { textsOf } from '../memberTexts';

const READ_ONLY_TAG = '[read-only] ';
const DEBUG_TAG = '[debug] ';

/** `text` without its leading `tag`, when it starts with it. */
const withoutTag = (text: string, tag: string): string =>
  text.startsWith(tag) ? text.slice(tag.length) : text;

/** The full set's sentence, its `[read-only]` and `[debug]` tags left out. */
const untagged = (description: string): string =>
  withoutTag(withoutTag(description, READ_ONLY_TAG), DEBUG_TAG);

const ANSWERS_WORDS =
  "Answers the calls of the last executed batch by number: for each number asked, the tool's answer, built from the call's parts of SAP's response when the number is first read and kept for later reads; the numbers asked are processed in parallel. Takes one number or a list of numbers; an unknown number answers as unknown.";

/** `HandlerDebugBatch`'s actions. */
export const DEBUG_BATCH_ACTIONS = ['begin', 'end', 'answers'] as const;
type DebugBatchAction = (typeof DEBUG_BATCH_ACTIONS)[number];

/** Each action's sentence: the full set's, one per action. */
const ACTION_SENTENCES: ReadonlyArray<readonly [DebugBatchAction, string]> = [
  ['begin', `action 'begin': ${untagged(DebugBatchBegin_Tool.description)}`],
  ['end', `action 'end': ${untagged(DebugBatchEnd_Tool.description)}`],
  ['answers', `action 'answers' (with number or numbers): ${ANSWERS_WORDS}`],
];

/** Each action's words in `action`'s description. */
const ACTION_WORDS: ReadonlyArray<readonly [DebugBatchAction, string]> = [
  [
    'begin',
    'begin starts the debugger batch on the stopped ABAP debuggee or at the AMDP break',
  ],
  ['end', 'end sends the recorded calls and ends it'],
  [
    'answers',
    "answers reads the last batch's answers by number, with number or numbers",
  ],
];

const NUMBER_PROPERTIES = {
  number: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('answers: one batch number to read, at least 1.'),
  numbers: z
    .array(z.number().int().min(1))
    .min(1)
    .optional()
    .describe(
      'answers: several batch numbers to read, each at least 1, answered in the order given.',
    ),
};

/** The action's description: the actions' words, the last after "; ". */
function actionWords(actions: readonly DebugBatchAction[]): string {
  return `${textsOf(actions, ACTION_WORDS).join('; ')}.`;
}

/**
 * `HandlerDebugBatch`'s description and schema with `actions`: each text
 * names only the actions given; `number` / `numbers` go with `answers` alone.
 */
export function handlerDebugBatchDefinition(
  actions: readonly DebugBatchAction[],
) {
  return {
    description: textsOf(actions, ACTION_SENTENCES).join(' '),
    inputSchema: z.object({
      action: listedValues(actions).describe(actionWords(actions)),
      ...(actions.includes('answers') ? NUMBER_PROPERTIES : {}),
    }),
  };
}

/** `HandlerDebugBatch`'s description with every action. */
export const HANDLER_DEBUG_BATCH_DESCRIPTION =
  handlerDebugBatchDefinition(DEBUG_BATCH_ACTIONS).description;

export const TOOL_DEFINITION = {
  name: 'HandlerDebugBatch',
  available_in: ['onprem', 'cloud'] as const,
  description: HANDLER_DEBUG_BATCH_DESCRIPTION,
  inputSchema: z.object({
    action: listedValues(DEBUG_BATCH_ACTIONS).describe(
      actionWords(DEBUG_BATCH_ACTIONS),
    ),
    ...NUMBER_PROPERTIES,
  }),
} as const;

type DebugBatchArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleHandlerDebugBatch(
  context: HandlerContext,
  args: DebugBatchArgs,
) {
  if (args.action !== 'answers' && asksNumbers(args)) {
    throw new Error(NUMBER_WITHOUT_ANSWERS_WORDS);
  }
  switch (args.action) {
    case 'begin':
      return beginDebugBatch(context);
    case 'end':
      return endDebugBatch(context);
    case 'answers':
      return answersOf(context, args);
  }
}
