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
export const DETAIL_PROPERTY = {
  detail: {
    type: 'string',
    enum: ['terse', 'full', 'raw'],
    default: 'terse',
    description:
      'How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).',
  },
} as const;

const LEVELS = new Set<AnswerDetail>(['terse', 'full', 'raw']);

/** Read it out of `args`, defaulting to terse. An unknown value is terse too. */
export function detailOf(args: unknown): AnswerDetail {
  const value = (args as { detail?: unknown } | undefined)?.detail;
  return typeof value === 'string' && LEVELS.has(value as AnswerDetail)
    ? (value as AnswerDetail)
    : 'terse';
}
