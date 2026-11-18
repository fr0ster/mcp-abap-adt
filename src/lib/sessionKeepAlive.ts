/**
 * The session keep-alive: after about 35–60 minutes without a request, SAP
 * ends the server's SAP session, and the first call after the pause fails
 * (a POST `403 CSRF token validation failed`, a LOCK `SESSION_REPLACED`).
 * A request now and then on the held connection lets the system see the
 * session is alive — a ping, like a WebSocket's ping-pong (the owner's fix).
 *
 * **A named exception to "no timers in production"** (the owner,
 * 2026-11-18): a wrapper around the connection the server builds
 * (`withSessionKeepAlive`) with one timer, `unref()`'d so it never keeps
 * the process alive, re-armed by the end of every request that goes through
 * it and stopped by the connection's logoff, its replacement or the
 * server's close; a replaced connection gets a wrapper of its own. The ping is one stateless `GET` of the
 * ADT discovery, never retried; a failure is logged at `debug` in fixed
 * words with its status only.
 *
 * The interval is `--session-keep-alive-minutes` /
 * `MCP_SESSION_KEEP_ALIVE_MINUTES` / YAML `session-keep-alive-minutes`: a
 * whole number of minutes, default 10, `0` off.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { Logger } from '@mcp-abap-adt/logger';
import type { JsonValue } from './json';
import { isAsciiDigits } from './plainText';
import { childAt } from './thrownValue';

/** The default interval, in minutes. */
export const DEFAULT_SESSION_KEEP_ALIVE_MINUTES = 10;

/**
 * The longest interval a timer can hold: `setTimeout` takes at most
 * 2^31-1 ms, and above that it fires after 1 ms.
 */
export const MAX_SESSION_KEEP_ALIVE_MS = 2 ** 31 - 1;

/** The longest interval in whole minutes. */
export const MAX_SESSION_KEEP_ALIVE_MINUTES = Math.floor(
  MAX_SESSION_KEEP_ALIVE_MS / 60_000,
);

/** The request the ping sends: the ADT discovery, as Eclipse reads it. */
export const SESSION_KEEP_ALIVE_URL = '/sap/bc/adt/discovery';
const SESSION_KEEP_ALIVE_ACCEPT = 'application/atomsvc+xml';

/** The fixed words of a ping that failed; its status follows. */
export const SESSION_KEEP_ALIVE_FAILED_WORDS =
  '[MCP] The session keep-alive request failed';

/**
 * The interval as written (CLI, environment, YAML): a whole number of
 * minutes from 0 (off) to {@link MAX_SESSION_KEEP_ALIVE_MINUTES}, ASCII
 * digits only or a YAML number; anything else is refused, never clamped.
 * `name` is the form it was given in, for the refusal.
 */
export function parseSessionKeepAliveMinutes(
  raw: JsonValue,
  name: string,
): number {
  const text = typeof raw === 'string' ? raw.trim() : String(raw);
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && isAsciiDigits(text)
        ? Number.parseInt(text, 10)
        : Number.NaN;
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_SESSION_KEEP_ALIVE_MINUTES
  ) {
    throw new Error(
      `Invalid ${name}: "${text}". Must be a whole number of minutes from 0 (off) to ${MAX_SESSION_KEEP_ALIVE_MINUTES}`,
    );
  }
  return value;
}

/**
 * The interval a caller's options give in milliseconds (`sessionKeepAliveMs`):
 * a whole number from 0 (off) to {@link MAX_SESSION_KEEP_ALIVE_MS}.
 */
export function sessionKeepAliveMsOf(value: number, name: string): number {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_SESSION_KEEP_ALIVE_MS
  ) {
    throw new Error(
      `Invalid ${name}: "${value}". Must be a whole number of milliseconds from 0 (off) to ${MAX_SESSION_KEEP_ALIVE_MS}`,
    );
  }
  return value;
}

/** What the wrapper needs beside the connection. */
export interface SessionKeepAliveOptions {
  /** The interval, in milliseconds (`sessionKeepAliveMsOf`); `0`: no wrapper. */
  readonly intervalMs: number;
  /** Where a failed ping's line goes, at `debug`. */
  readonly logger: Logger;
  /**
   * The holder's own say beside the connection's: whether it still holds
   * the connection as its live one (not ended, not replaced, its instance
   * not closed). Read before every ping.
   */
  readonly held: () => boolean;
}

/** Each wrapper's stop, by the wrapper handed out. */
const stops = new WeakMap<object, () => void>();

/**
 * `connection` with a keep-alive: a decorator that forwards every member
 * as it is and sees every `makeAdtRequest` — so it alone knows when the
 * last request ended and how many are in flight. Once none has been in
 * flight for the whole interval, and the connection is live — connected
 * (`isConnected()`, so its session exists and a ping needs no logon) and
 * `held` —, it sends the ping through itself. A ping never connects: a
 * connection not yet connected, spent or ended is never pinged, and its
 * timer is not armed again.
 *
 * One timer per wrapper, `unref()`'d, re-armed when the last request in
 * flight ends and after `connect()`; stopped for good by `disconnect()`
 * (the logoff) and by `stopSessionKeepAlive`. With an interval of `0` the
 * connection is returned as it is.
 */
export function withSessionKeepAlive(
  connection: IAbapConnection,
  options: SessionKeepAliveOptions,
): IAbapConnection {
  if (options.intervalMs === 0) return connection;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = 0;
  let stopped = false;
  const clear = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const live = (): boolean => {
    if (stopped) return false;
    try {
      return connection.isConnected?.() === true && options.held();
    } catch {
      return false;
    }
  };
  const arm = (): void => {
    clear();
    if (inFlight > 0 || !live()) return;
    timer = setTimeout(due, options.intervalMs);
    timer.unref(); // never keeps the process alive
  };
  const makeAdtRequest: IAbapConnection['makeAdtRequest'] = async (request) => {
    inFlight += 1;
    clear();
    try {
      return await connection.makeAdtRequest(request);
    } finally {
      inFlight -= 1;
      if (inFlight === 0) arm();
    }
  };
  const connect: IAbapConnection['connect'] = async () => {
    await connection.connect();
    arm();
  };
  const stop = (): void => {
    stopped = true;
    clear();
  };
  const disconnect = async (): Promise<void> => {
    stop();
    await connection.disconnect?.();
  };
  const wrapped = new Proxy(connection, {
    get(target, property) {
      if (property === 'makeAdtRequest') return makeAdtRequest;
      if (property === 'connect') return connect;
      if (property === 'disconnect' && target.disconnect !== undefined) {
        return disconnect;
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  // The ping goes through the wrapper: counted in flight, and its end
  // re-arms the timer for a whole interval.
  function due(): void {
    timer = undefined;
    if (inFlight > 0 || !live()) return;
    void sendSessionKeepAlive(wrapped, options.logger);
  }
  stops.set(wrapped, stop);
  return wrapped;
}

/**
 * Stops `connection`'s keep-alive for good (a connection replaced, its
 * holder closed); nothing for a connection without one.
 */
export function stopSessionKeepAlive(connection: object): void {
  stops.get(connection)?.();
}

/**
 * The ping: one `GET` of the ADT discovery on `connection`, as the
 * connection's ordinary request — no timeout, never retried. A status other
 * than a `2xx`, an answer that shows the session lost, or a failure is
 * logged at `debug` in fixed words with the status only. A lost or replaced
 * session spends the connection as any request's answer does; the next
 * call logs on again.
 */
export async function sendSessionKeepAlive(
  connection: IAbapConnection,
  logger: Logger,
): Promise<void> {
  let status: number | undefined;
  try {
    const answer = await connection.makeAdtRequest({
      url: SESSION_KEEP_ALIVE_URL,
      method: 'GET',
      timeout: 0,
      headers: { Accept: SESSION_KEEP_ALIVE_ACCEPT },
    });
    if (
      answer.status >= 200 &&
      answer.status < 300 &&
      answer.sessionLost === undefined
    ) {
      return;
    }
    status = answer.status;
  } catch (error) {
    status = statusOf(error);
  }
  try {
    logger.debug(
      `${SESSION_KEEP_ALIVE_FAILED_WORDS}: status ${status ?? 'none'}`,
    );
  } catch {
    // A logger that throws changes nothing: the ping is not retried.
  }
}

/** The HTTP status a failed request carries, if it is a number (read guarded). */
function statusOf(error: unknown): number | undefined {
  try {
    const status = childAt(error, 'response', 'status');
    return typeof status === 'number' ? status : undefined;
  } catch {
    return undefined;
  }
}
