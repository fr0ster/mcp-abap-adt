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
export const HANDLER_BATCH_DESCRIPTION = [
  "action 'begin': Switches this server into batch mode: from now on each call of a tool none of whose requests depends on another's answer is recorded instead of sent, and returns nothing. Every recorded call is numbered, in the order made, from 1. A tool that builds a request from an earlier answer is refused in batch mode; use the low-level tools (HandlerCreate, HandlerLock, HandlerUpdate with lock_handle, HandlerUnlock, HandlerGet) and run each phase as its own batch. action 'end' sends the recorded calls; read their answers by number with action 'answers'. Over HTTP, send the state_handle this answers in the request header on every call of the batch.",
  "action 'end': Sends every call recorded since action 'begin', in one envelope, with the credentials in force now, and leaves batch mode whatever happens; nothing is sent twice. Answers how many calls were recorded and which numbers failed; read each answer with action 'answers'.",
  "action 'answers' (with number or numbers): The answers of the last batch, by number: each is the answer the tool gives for that call, built when action 'end' sent it — SAP's answer or why it was not sent. A number the last batch does not have answers: no answer with that number.",
].join(' ');

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
