/** A wait bounded by event-loop turns, not by a clock. */

/**
 * `promise`, or a failure once `turns` event-loop turns passed with it
 * unsettled: a broken rule fails the case instead of hanging it.
 */
export async function withinTurns<T>(
  promise: Promise<T>,
  turns = 200,
): Promise<T> {
  let settled = false;
  const watched = promise.finally(() => {
    settled = true;
  });
  // Handled from the start: a rejection while the turns pass is not
  // unhandled, and one after the bound is read by no one.
  watched.catch(() => undefined);
  for (let turn = 0; turn < turns && !settled; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (!settled) throw new Error('never settled');
  return watched;
}
