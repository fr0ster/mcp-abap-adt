/**
 * The idle bound on held state: the user's one exception to "no timeouts"
 * (2026-10-10), for the server variants only (Streamable HTTP, SSE). Held
 * state ends when the USER has not called for this many minutes. Waiting for
 * the server is never timed: a tool call in flight pauses the bound, and a
 * part's own background work (a listener's re-poll) is not a call. The
 * listener re-polls by itself, so SAP's own session timeout never fires on
 * an abandoned debug session — this bound does.
 *
 * stdio has none (`NO_IDLE_BOUND`): its life and its state are governed by
 * the client that started it — state ends by an explicit tool, the client
 * closing stdin, the backend's answer, or process shutdown, never on the
 * server's clock.
 */

import { isAsciiDigits } from '../plainText';

/**
 * No idle bound: held state never ends on the server's clock. What stdio
 * states; an instance given it arms no timer.
 */
export const NO_IDLE_BOUND = 'none';

/** The idle bound of an instance: whole minutes, or none. */
export type StateIdleBound = number | typeof NO_IDLE_BOUND;

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
/** `-`, then digits, then optionally `.` and digits: a decimal written out, nothing else. */
function isDecimal(text: string): boolean {
  const unsigned = text.startsWith('-') ? text.slice(1) : text;
  const point = unsigned.indexOf('.');
  if (point === -1) return isAsciiDigits(unsigned);
  return (
    isAsciiDigits(unsigned.slice(0, point)) &&
    isAsciiDigits(unsigned.slice(point + 1))
  );
}

export function parseStateIdleMinutes(raw: unknown, name: string): number {
  const text = typeof raw === 'string' ? raw.trim() : undefined;
  const value =
    typeof raw === 'number'
      ? raw
      : text !== undefined && isDecimal(text)
        ? Number(text)
        : Number.NaN;
  return idleMinutesWithin(value, String(raw), name);
}

/**
 * A bound given as a number by a caller's options (`idleMinutes`,
 * `stateIdleMinutes`): the same range as a written one.
 */
export function stateIdleMinutesOf(value: number, name: string): number {
  return idleMinutesWithin(value, String(value), name);
}

/** `value` when it is a whole number of minutes in range; `shown` is the value as the refusal quotes it. */
function idleMinutesWithin(value: number, shown: string, name: string): number {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < MIN_STATE_IDLE_MINUTES
  ) {
    throw new Error(
      `Invalid ${name}: "${shown}". Must be a whole number of minutes, at least ${MIN_STATE_IDLE_MINUTES}`,
    );
  }
  if (value > MAX_STATE_IDLE_MINUTES) {
    throw new Error(
      `Invalid ${name}: "${shown}". Must be at most ${MAX_STATE_IDLE_MINUTES} minutes, the longest a timer can hold`,
    );
  }
  return value;
}
