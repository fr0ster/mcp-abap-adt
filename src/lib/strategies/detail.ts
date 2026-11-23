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
  'How much of the answer to return, and in what form: "terse" (default) what a next call needs, its lists as TSV (a header, then a row per item) under "#" lines for the facts beside them; "medium" every item of the same lists, as JSON; "full" the tool\'s whole answer, as JSON; "raw" what SAP sent, as it sent it.';

/** `detail`: one text, the same on every tool (plan step 10.3). */
export const DETAIL_WORDS = LEVEL_WORDS;

/**
 * `detail` of a tool that assembles reads and is not yet assembled from its
 * parts (plan step 10.7): the shared text, then what its raw is — which an
 * assembled tool states as a fact of its own (`rawReturns`). Removed when
 * the last such tool moves.
 */
const ASSEMBLED_DETAIL_WORDS = `${LEVEL_WORDS} At raw: everything SAP sent for the call, in the order it was read.`;

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
