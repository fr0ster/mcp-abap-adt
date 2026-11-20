/**
 * The session keep-alive: after about 35–60 minutes without a request, SAP
 * ends the server's SAP session, and the first call after the pause fails
 * (a POST `403 CSRF token validation failed`, a LOCK `SESSION_REPLACED`).
 * A request now and then on the held connection lets the system see the
 * session is alive — a ping, like a WebSocket's ping-pong (the owner's fix).
 * The credentials are accepted after the pause; what SAP ended is the ABAP
 * user session.
 *
 * **A named exception to "no timers in production"** (the owner,
 * 2026-11-18): one `setTimeout` per server, `unref()`'d so it never keeps
 * the process alive, re-armed after each tick settled, cleared at the
 * server's close. Each connection the server builds carries a request mark
 * (`withRequestMark`), bumped by every request in the stateful session; a
 * tick that finds the held
 * connection's mark unchanged since the previous tick, and the connection
 * live, sends the ping through it in the main flow's turn. So the first
 * ping comes one to two intervals after the last request. The ping is one
 * stateful discovery request in the server's own session — the long-lived
 * connection to SAP that holds it, HTTP or RFC alike (fresh connections
 * for background runs and long reads are not pinged): the mechanism starts
 * when that connection logged on and stops when it is logged off, ended,
 * spent or closed; it never opens a connection. The tick sends it
 * once; a failure is logged at `debug` in fixed words with its status only.
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

/** Each wrapped connection's request mark: how many requests went through it in its stateful session. */
const marks = new WeakMap<object, number>();

/**
 * Gives `connection` a request mark: its `makeAdtRequest` is replaced, on
 * the connection itself, by a thin wrapper that counts each request sent in
 * the stateful session as it goes out — the connection set stateful, the
 * condition the connection itself sends a request stateful by (a LOCK, an
 * UNLOCK, the debugger's stateful sends, the ping) — and sends every
 * request as before; nothing else. A stateless request is not counted: it
 * runs in a session of its own and keeps the stateful one alive no more
 * (the owner). The connection stays the same object (every record keyed by
 * it still finds it). The server's keep-alive reads the mark
 * (`requestMark`) on each tick: a mark unchanged since the previous tick is
 * a connection with no request in its stateful session for the whole
 * interval. Answers `connection`.
 */
export function withRequestMark(connection: IAbapConnection): IAbapConnection {
  const send = connection.makeAdtRequest;
  marks.set(connection, 0);
  connection.makeAdtRequest = (request) => {
    if (connection.getSessionMode?.() === 'stateful') {
      marks.set(connection, (marks.get(connection) ?? 0) + 1);
    }
    return send.call(connection, request);
  };
  return connection;
}

/** `connection`'s request mark; `undefined` for a connection not wrapped. */
export function requestMark(connection: object): number | undefined {
  return marks.get(connection);
}

/**
 * The ping: one `GET` of the ADT discovery on `connection`, in the session
 * mode the caller set (the server's: stateful) — no timeout, sent once. A status other
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

/** The HTTP status a failed request or its cause carries, if a number (read guarded). */
function statusOf(error: unknown): number | undefined {
  try {
    // The failure's own, else its cause's: a refusal the credential's
    // answer wraps carries the wire's failure as its cause.
    const own = childAt(error, 'response', 'status');
    if (typeof own === 'number') return own;
    const cause = childAt(error, 'cause', 'response', 'status');
    return typeof cause === 'number' ? cause : undefined;
  } catch {
    return undefined;
  }
}
