/**
 * The ATC live case's poll of a run started with `wait=false` (D27, step 13):
 * the next poll is sent on the previous one's answer, with no pause between
 * and no limit on how many, and the poll ends on the status alone. A run that
 * never finishes keeps the case waiting; the person running the suite ends
 * it with the runner's interrupt (`src/__tests__/integration/README.md`,
 * "Interrupting a run").
 *
 * Uses no test runner.
 */

/**
 * Calls `poll` until it answers that the run finished; answers how many
 * polls that took.
 */
export async function pollUntilFinished(
  poll: () => Promise<boolean>,
): Promise<number> {
  let polls = 0;
  let finished = false;
  while (!finished) {
    polls += 1;
    finished = await poll();
  }
  return polls;
}
