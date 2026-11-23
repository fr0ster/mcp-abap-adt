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
const LEVEL_WORDS =
  'How much of the answer to return: "terse" (default, the fields you need to act), "medium" (every field of the reading; currently the same as "full"), "full" (the whole parse), ';

/** `detail` of a tool that reads one document: raw is that document. */
const DETAIL_WORDS = `${LEVEL_WORDS}"raw" (the document as ADT sent it).`;

/** `detail` of a tool that assembles reads: raw is the array of them, one read too. */
const ASSEMBLED_DETAIL_WORDS = `${LEVEL_WORDS}"raw" (what ADT sent: a JSON array of the documents the call read, in read order, an array even for one).`;

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
