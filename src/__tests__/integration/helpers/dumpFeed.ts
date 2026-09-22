/**
 * Reading the runtime-dump feed: which entries are worth opening.
 *
 * A module rather than a function inside the suite, because the choice is
 * worth a test of its own and importing a `.test.ts` file to reach it would
 * register that suite's own cases a second time.
 */

/**
 * Which feed entries are worth opening, in order.
 *
 * **The title narrows; it does not decide.** `title` is the exception's short
 * text, and SAP writes that in the logon language — "Division by 0 (type I or
 * INT8)" is what an English session sees, and nothing says another session
 * sees the same. A filter that matched nothing would exhaust the polls and
 * throw on a system where the run dumped perfectly well: a saving turned into
 * a correctness gate, keyed on one language's string.
 *
 * So a narrowing to nothing falls back to the unnarrowed list. What decides
 * which run made a dump is the content check on the candidates this returns,
 * and that is the same either way — the title only decides how many are worth
 * opening first.
 */
export function candidatesWorthOpening(
  candidates: Array<{ id: string; title: string }>,
  titleFilter: string,
  max: number,
): { chosen: Array<{ id: string; title: string }>; narrowed: boolean } {
  const wanted = titleFilter.toLowerCase();
  const byTitle = candidates.filter((c) =>
    c.title.toLowerCase().includes(wanted),
  );
  const narrowed = byTitle.length > 0;
  return {
    chosen: (narrowed ? byTitle : candidates).slice(0, max),
    narrowed,
  };
}
