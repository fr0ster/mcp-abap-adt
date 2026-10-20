/**
 * The held-out queries: requests the tool texts were never tuned on (a
 * reviewer's 36, of a reader and a developer; the consumer's findings join
 * them). The tuning set (`queries.ts`) must pass whole; the held-out set
 * must not get worse than its recorded baseline (`heldOutBaseline.json`: the
 * query-role pairs that failed, per mode and model, when it was recorded).
 *
 * The rule: the texts are never edited to make a held-out query pass. A
 * held-out failure is fixed only together with fresh held-out queries, which
 * the fix is then measured on; the baseline is re-recorded with them, by hand.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Query } from './queries';
import { describeFailure, type Outcome } from './retrieval';

export const HELD_OUT: readonly Query[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'heldOutQueries.json'), 'utf8'),
) as Query[];

/** Per mode ("bm25", "cosine <model>", "hybrid <model>"): the pairs that failed, "[role] query". */
const BASELINE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'heldOutBaseline.json'), 'utf8'),
) as Record<string, readonly string[]>;

/** The key of an outcome's query-role pair. */
export function pairOf(outcome: Outcome): string {
  return `[${outcome.role}] ${outcome.query}`;
}

/**
 * The held-out pairs of `mode` that fail now and passed when the baseline was
 * recorded, each with its ranks; a mode the baseline holds no entry for is
 * reported as such.
 */
export function worseThanBaseline(
  mode: string,
  outcomes: readonly Outcome[],
): string[] {
  const recorded = BASELINE[mode];
  if (recorded === undefined) return [`no baseline recorded for ${mode}`];
  const allowed = new Set(recorded);
  return outcomes
    .filter((outcome) => !outcome.passed && !allowed.has(pairOf(outcome)))
    .map(describeFailure);
}
