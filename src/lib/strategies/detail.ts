import * as z from 'zod';
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
const DETAIL_WORDS =
  'How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).';

/** The `detail` field of a tool's zod input schema. */
export const DETAIL_SHAPE = {
  detail: z
    .enum(['terse', 'full', 'raw'])
    .default('terse')
    .optional()
    .describe(DETAIL_WORDS),
};

/** What a tool's arguments say of the detail: the field `DETAIL_SHAPE` adds. */
export interface DetailArgs {
  readonly detail?: AnswerDetail | undefined;
}

/** The detail `args` asked for, defaulting to terse. */
export function detailOf(args: DetailArgs): AnswerDetail {
  return args.detail ?? 'terse';
}
