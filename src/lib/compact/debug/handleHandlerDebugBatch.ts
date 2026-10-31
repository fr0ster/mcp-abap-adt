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
import type { ArgsOf, HandlerContext } from '../../handlers/index';
import { NUMBER_WITHOUT_ANSWERS_WORDS } from '../batch/handleHandlerBatch';

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

/** `HandlerDebugBatch`'s description: the full set's sentences, one per action. */
export const HANDLER_DEBUG_BATCH_DESCRIPTION = [
  `action 'begin': ${untagged(DebugBatchBegin_Tool.description)}`,
  `action 'end': ${untagged(DebugBatchEnd_Tool.description)}`,
  `action 'answers' (with number or numbers): ${ANSWERS_WORDS}`,
].join(' ');

export const TOOL_DEFINITION = {
  name: 'HandlerDebugBatch',
  available_in: ['onprem', 'cloud'] as const,
  description: HANDLER_DEBUG_BATCH_DESCRIPTION,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['begin', 'end', 'answers'],
        description:
          "begin starts the debugger batch on the stopped ABAP debuggee or at the AMDP break; end sends the recorded calls and ends it; answers reads the last batch's answers by number, with number or numbers.",
      },
      number: {
        type: 'integer',
        minimum: 1,
        description: 'answers: one batch number to read, at least 1.',
      },
      numbers: {
        type: 'array',
        items: { type: 'integer', minimum: 1 },
        minItems: 1,
        description:
          'answers: several batch numbers to read, each at least 1, answered in the order given.',
      },
    },
    required: ['action'],
  },
} as const;

type DebugBatchArgs = ArgsOf<typeof TOOL_DEFINITION.inputSchema>;

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
