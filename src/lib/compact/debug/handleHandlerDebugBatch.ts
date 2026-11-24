import * as z from 'zod';
/**
 * `HandlerDebugBatch`: the debugger batch in the compact set, one tool for
 * the three actions — `begin`, `end`, `answers` — each as the full set's
 * tool of the same meaning (`DebugBatchBegin`, `DebugBatchEnd`,
 * `DebugBatchAnswers`). `number` / `numbers` go with `answers` alone; given with
 * another action, the call is refused before anything runs.
 */

import { TOOL_DEFINITION as DebugBatchAnswers_Tool } from '../../../handlers/debugger/debug/handleDebugBatchAnswers';
import { TOOL_DEFINITION as DebugBatchBegin_Tool } from '../../../handlers/debugger/debug/handleDebugBatchBegin';
import { TOOL_DEFINITION as DebugBatchEnd_Tool } from '../../../handlers/debugger/debug/handleDebugBatchEnd';
import { asksNumbers } from '../../batch/batchTools';
import { answersOf, beginDebugBatch, endDebugBatch } from '../../batch/tools';
import {
  type DescriptionParts,
  purpose,
  toolDescription,
  valueFrom,
} from '../../description/index';
import type { HandlerContext } from '../../handlers/index';
import { listedValues } from '../../handlers/listedValues';
import { NUMBER_WITHOUT_ANSWERS_WORDS } from '../batch/handleHandlerBatch';
import { textsOf } from '../memberTexts';

/** `HandlerDebugBatch`'s actions. */
export const DEBUG_BATCH_ACTIONS = ['begin', 'end', 'answers'] as const;
type DebugBatchAction = (typeof DEBUG_BATCH_ACTIONS)[number];

/** Each action by its function: the full set's tool of the same meaning. */
const ACTION_VALUES = {
  begin: valueFrom('begin', DebugBatchBegin_Tool.description),
  end: valueFrom('end', DebugBatchEnd_Tool.description),
  answers: valueFrom('answers', DebugBatchAnswers_Tool.description),
} as const;

/** `HandlerDebugBatch`'s parts with `actions`: each action by its function. */
export function handlerDebugBatchParts(
  actions: readonly DebugBatchAction[],
): DescriptionParts {
  return {
    tag: 'debug',
    purpose: purpose(
      "Records the debugger calls at the stopped ABAP debuggee or the AMDP break and sends them together, then reads each call's outcome by its number.",
    ),
    returns: [],
    values: {
      of: 'action',
      each: actions.map((action) => ACTION_VALUES[action]),
    },
  };
}

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
    description: toolDescription(handlerDebugBatchParts(actions)),
    inputSchema: z.object({
      action: listedValues(actions).describe(actionWords(actions)),
      ...(actions.includes('answers') ? NUMBER_PROPERTIES : {}),
    }),
  };
}

export const TOOL_DEFINITION = {
  name: 'HandlerDebugBatch',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(handlerDebugBatchParts(DEBUG_BATCH_ACTIONS)),
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
