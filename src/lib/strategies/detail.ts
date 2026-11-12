import * as z from 'zod';
import { child } from '../xml/tree';
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

/** Whether `value` is one of the three levels. */
function isDetail(value: unknown): value is AnswerDetail {
  return value === 'terse' || value === 'full' || value === 'raw';
}

/** Read it out of `args`, defaulting to terse. An unknown value is terse too. */
export function detailOf(args: unknown): AnswerDetail {
  const value = child(args, 'detail');
  return isDetail(value) ? value : 'terse';
}
