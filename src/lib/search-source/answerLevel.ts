/** How much a `SearchSource` answer holds of each hit (DO23). */
export const ANSWER_LEVELS = ['objects', 'lines', 'snippets'] as const;

/** One of `ANSWER_LEVELS`; `snippets` when a call names none. */
export type AnswerLevel = (typeof ANSWER_LEVELS)[number];
