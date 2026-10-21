/**
 * `BatchAnswers`: the map of the last ended batch, read by number (spec §6).
 * A number's handler, waiting at its first request, is resumed with its
 * parts when the number is first read and builds its answer; the numbers
 * asked in one call are processed in parallel, and the answer is kept. A
 * number of a batch whose `BatchEnd` failed answers that error. Nothing is
 * sent to SAP; served while a batch is open, so the previous phase's
 * answers stay readable while the next phase is recorded.
 */
import type { McpResult } from '../answer';
import type { BatchAnswer, InstanceBatch } from './InstanceBatch';

/** A number the last executed batch has no answer for (or no batch ran here). */
export type NoAnswer = { number: number; error: 'no_answer'; message: string };

/** One entry of `BatchAnswers`' answer: the number's answer, or that it has none. */
export type AnswerEntry = BatchAnswer | NoAnswer;

export const NO_ANSWER_WORDS = 'no answer with that number';

/** `number` and `numbers` both given, or neither. */
export const ANSWERS_ASK_WORDS =
  'give exactly one of number (an integer of at least 1) or numbers (a list of at least one such integer)';

/** A number that is not an integer of at least 1. */
export const ANSWERS_NUMBER_WORDS =
  'a batch answer number is an integer of at least 1';

/** What `BatchAnswers` was asked: exactly one of `number` and `numbers`. */
export type AnswersAsk = { number?: unknown; numbers?: unknown };

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

/** The numbers asked, in the order asked; throws its words for an ask it refuses — before anything is read. */
function numbersAsked(ask: AnswersAsk): number[] {
  const one = ask.number !== undefined;
  const many = ask.numbers !== undefined;
  if (one === many) throw new Error(ANSWERS_ASK_WORDS);
  const asked = one ? [ask.number] : ask.numbers;
  if (!Array.isArray(asked) || asked.length === 0) {
    throw new Error(ANSWERS_ASK_WORDS);
  }
  if (!asked.every(isNumber)) throw new Error(ANSWERS_NUMBER_WORDS);
  return asked;
}

/**
 * One entry per number asked, in the order asked — a number asked twice is
 * answered twice, by one run of its handler: its answer, or "no answer with
 * that number" when the last ended batch has none (or no batch has ended on
 * this instance). The ask is checked first: a refused ask throws its words
 * before any handler is resumed.
 */
export function readAnswers(
  owner: InstanceBatch,
  ask: AnswersAsk,
): Promise<AnswerEntry[]> {
  const asked = numbersAsked(ask);
  return Promise.all(
    asked.map(
      (number): Promise<AnswerEntry> | AnswerEntry =>
        owner.answer(number) ?? {
          number,
          error: 'no_answer',
          message: NO_ANSWER_WORDS,
        },
    ),
  );
}

/** `BatchAnswers`' answer: its entries, as JSON. */
export function batchAnswersAnswer(entries: AnswerEntry[]): McpResult {
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(entries, null, 2) }],
  };
}
