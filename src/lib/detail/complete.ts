/**
 * An answer is the complete result or an error, never a partial one (the
 * owner's rule). SAP's read gives all or nothing; the risk is a formatter of
 * ours that drops, merges or misses an item, so the model reads an answer
 * that looks whole and is not.
 *
 * A formatter that reshapes a typed reading is wrapped in `completeAnswer`:
 * the reading names the identities of every item it holds — its entries,
 * and the incomplete entries, not-loaded nodes and incomplete objects beside
 * them — and the formatter answers what it rendered with the identities of
 * the items it rendered. The two must be the same items, each as often; on
 * any difference the call ends with `IncompleteAnswerError`, in fixed words
 * naming the tool, which the answer boundary answers as the error
 * `incomplete_answer` (`src/lib/answer.ts`) — no partial answer, and no SAP
 * text.
 *
 * `raw` answers the documents as ADT sent them (`./wire`), and the generic
 * parse of `full` (`fullLevel`) keeps every element: neither reshapes, so
 * neither can lose an item. A `full` of our own assembly is guarded like any
 * other formatter.
 */

/** A formatter's answer, and the identity of each item it rendered. */
export interface Rendered<A> {
  readonly answer: A;
  readonly rendered: readonly string[];
}

/** The fixed words of an incomplete answer: the tool, and what to ask instead. */
export function incompleteAnswerWords(tool: string): string {
  return `${tool}: the compact answer could not represent every item the reading held, so nothing is answered; ask detail: 'full'`;
}

/** A formatter rendered other items than its reading held. */
export class IncompleteAnswerError extends Error {
  constructor(readonly tool: string) {
    super(incompleteAnswerWords(tool));
    this.name = 'IncompleteAnswerError';
  }
}

/** Whether two lists hold the same items, each as often. */
function sameItems(held: readonly string[], rendered: readonly string[]) {
  if (held.length !== rendered.length) return false;
  const counts = new Map<string, number>();
  for (const item of held) counts.set(item, (counts.get(item) ?? 0) + 1);
  for (const item of rendered) {
    const left = counts.get(item) ?? 0;
    if (left === 0) return false;
    counts.set(item, left - 1);
  }
  return true;
}

/**
 * `render` guarded: its answer when it rendered every item `held` names,
 * each once per holding; otherwise `IncompleteAnswerError` for `tool`.
 */
export function completeAnswer<T, A>(
  tool: string,
  held: (value: T) => readonly string[],
  render: (value: T) => Rendered<A>,
): (value: T) => A {
  return (value) => {
    const answered = render(value);
    if (!sameItems(held(value), answered.rendered)) {
      throw new IncompleteAnswerError(tool);
    }
    return answered.answer;
  };
}
