import * as z from 'zod';
import { DETAIL_LEVELS, type DetailLevel } from '../detail/levels';
import type { AnswerDetail } from './projections';

export type { AnswerDetail };

/**
 * The `detail` parameter, for tools whose answer is JSON.
 *
 * Not for the rest: where a tool promised the document — source, metadata —
 * terse, full and raw are the same bytes, and a parameter that cannot change
 * the answer is noise on a surface callers read to decide what to call. It
 * shapes the SUCCESS answer only; a failure carries everything at every level.
 */
/**
 * What each level holds, in words that are true for every tool — no syntax
 * named (the owner's option A): the shared text of every tool's `detail`,
 * each tool listing the levels it offers.
 */
export const LEVEL_SENTENCES = {
  terse:
    '"terse" (default) what a next call needs: the identifiers and a short description',
  medium: '"medium" every item the tool read, with its main properties',
  full: '"full" the tool\'s whole answer',
  raw: '"raw" what SAP sent',
} as const;

/** The shared text over the levels a tool offers, in their order. */
export function levelWords(
  levels: readonly (keyof typeof LEVEL_SENTENCES)[],
): string {
  return `How much of the answer to return: ${levels.map((level) => LEVEL_SENTENCES[level]).join('; ')}.`;
}

const LEVEL_WORDS = levelWords(['terse', 'medium', 'full', 'raw']);

/** `detail`: one text, the same on every tool (plan step 10.3). */
export const DETAIL_WORDS = LEVEL_WORDS;

/** `detail` of a tool that assembles reads: the same shared text. */
const ASSEMBLED_DETAIL_WORDS = LEVEL_WORDS;

/**
 * The `detail` field of a tool's zod input schema — a tool that reads one
 * document: its raw is that document. The raw shape is the tool's
 * (`src/lib/detail/wire.ts`): a tool that assembles reads takes
 * {@link ASSEMBLED_DETAIL_SHAPE}.
 */
export const DETAIL_SHAPE = {
  detail: z
    .enum(DETAIL_LEVELS)
    .default('terse')
    .optional()
    .describe(DETAIL_WORDS),
};

/** The `detail` field of a tool that assembles reads: its raw is the array of the documents. */
export const ASSEMBLED_DETAIL_SHAPE = {
  detail: z
    .enum(DETAIL_LEVELS)
    .default('terse')
    .optional()
    .describe(ASSEMBLED_DETAIL_WORDS),
};

/** What a tool's arguments say of the detail: the field `DETAIL_SHAPE` adds. */
export interface DetailArgs {
  readonly detail?: DetailLevel | undefined;
}

/**
 * The detail `args` asked for, defaulting to terse, as a projection reads it:
 * `medium` answers as `full` until a tool gives it a reading of its own.
 */
export function detailOf(args: DetailArgs): AnswerDetail {
  const level = levelOf(args);
  return level === 'medium' ? 'full' : level;
}

/** The level `args` asked for, defaulting to terse: what a tool's `DetailTable` is read at. */
export function levelOf(args: DetailArgs): DetailLevel {
  return args.detail ?? 'terse';
}
