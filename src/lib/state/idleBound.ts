/**
 * The idle bound on held state: the user's one exception to "no timeouts"
 * (2026-10-10). Held state ends when the USER has not called for this many
 * minutes. Waiting for the server is never timed: a tool call in flight
 * pauses the bound, and a part's own background work (a listener's re-poll)
 * is not a call. The listener re-polls by itself, so SAP's own session
 * timeout never fires on an abandoned debug session — this bound does.
 */

export const DEFAULT_STATE_IDLE_MINUTES = 30;
export const MIN_STATE_IDLE_MINUTES = 30;
/**
 * The largest bound a timer can hold: `setTimeout` takes at most 2^31-1 ms,
 * and above that it fires after 1 ms — every session would end at once.
 */
export const MAX_STATE_IDLE_MINUTES = Math.floor((2 ** 31 - 1) / 60_000);

/**
 * The bound as a whole number of minutes, at least 30 and at most 35791
 * (the timer's limit); anything else is a
 * misconfiguration and refused, never clamped. `name` is the form the value
 * was given in (`--state-idle-minutes`, the env variable, the YAML key, the
 * option), for the refusal.
 */
export function parseStateIdleMinutes(raw: unknown, name: string): number {
  const text = typeof raw === 'string' ? raw.trim() : undefined;
  const value =
    typeof raw === 'number'
      ? raw
      : text !== undefined && /^-?\d+(\.\d+)?$/.test(text)
        ? Number(text)
        : Number.NaN;
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < MIN_STATE_IDLE_MINUTES
  ) {
    throw new Error(
      `Invalid ${name}: "${String(raw)}". Must be a whole number of minutes, at least ${MIN_STATE_IDLE_MINUTES}`,
    );
  }
  if (value > MAX_STATE_IDLE_MINUTES) {
    throw new Error(
      `Invalid ${name}: "${String(raw)}". Must be at most ${MAX_STATE_IDLE_MINUTES} minutes, the longest a timer can hold`,
    );
  }
  return value;
}
