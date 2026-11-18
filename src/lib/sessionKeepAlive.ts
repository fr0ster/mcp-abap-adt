/**
 * The session keep-alive: after about 35–60 minutes without a request, SAP
 * ends the server's SAP session, and the first call after the pause fails
 * (a POST `403 CSRF token validation failed`, a LOCK `SESSION_REPLACED`).
 * A request now and then on the held connection lets the system see the
 * session is alive — a ping, like a WebSocket's ping-pong (the owner's fix).
 *
 * **A named exception to "no timers in production"** (the owner,
 * 2026-11-18): one background timer per server, `unref()`'d so it never
 * keeps the process alive, ticking every interval and stopped by the
 * server's close. Each connection the server builds carries a request mark
 * (`withRequestMark`), bumped by every request; a tick that finds the held
 * connection's mark unchanged since the previous tick, and the connection
 * live, sends the ping through it. The ping is one stateless `GET` of the
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

/** Each wrapped connection's request mark: how many requests went through it. */
const marks = new WeakMap<object, number>();

/**
 * `connection` with a request mark: a thin wrapper over `makeAdtRequest`
 * that counts each request as it goes out, and does nothing else; every
 * other member is forwarded as it is. The server's keep-alive reads the
 * mark (`requestMark`) on each tick: a mark unchanged since the previous
 * tick is a connection with no request for the whole interval.
 */
export function withRequestMark(connection: IAbapConnection): IAbapConnection {
  const makeAdtRequest: IAbapConnection['makeAdtRequest'] = (request) => {
    marks.set(wrapped, (marks.get(wrapped) ?? 0) + 1);
    return connection.makeAdtRequest(request);
  };
  const wrapped = new Proxy(connection, {
    get(target, property) {
      if (property === 'makeAdtRequest') return makeAdtRequest;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  marks.set(wrapped, 0);
  return wrapped;
}

/** `connection`'s request mark; `undefined` for a connection not wrapped. */
export function requestMark(connection: object): number | undefined {
  return marks.get(connection);
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
