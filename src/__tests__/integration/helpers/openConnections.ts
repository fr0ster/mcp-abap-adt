/**
 * Connections a test file opened, closed when it ends.
 *
 * A connection that connected must disconnect: `disconnect()` sends the logoff
 * that ends its HTTP security session. Without it every test file left its
 * session in SM05 until the server's timeout — one per file, and nothing in the
 * helpers ever closed one (on premise, 2026-09-27). The ABAP session of a stateless
 * request ends with the request; the HTTP session, and a stateful context
 * inside it, do not.
 *
 * After a credential refusal (the run's marker) nothing is sent: a logoff
 * included, so a test connection is then left as it is.
 *
 * Each connection's logoff is sent once (#394, spec §6) and ends in one
 * terminal state: `logoff-withheld` (a credential refusal: nothing sent),
 * `logoff-threw` ("logoff failed") or `logoff-unconfirmed` ("logoff not
 * confirmed": the connection's contract cannot tell an answered logoff from
 * a lost one, so a logoff is never reported as done). A connection stays
 * tracked until the file's close, which reports every connection that still
 * owns something (`whatIsLeft`, from the reporters the soft-mode records
 * register) and fails the file naming what is left; a connection with no
 * record (hard mode's) only warns, as before.
 *
 * Kept free of other imports (but the run's files, Node's own modules only)
 * so the setup file that closes them loads nothing else: the records
 * register their reporters here, this file imports none of them.
 */
import { markerExists } from '../coverageReport/reportFormat';

type Closable = {
  disconnect?: () => Promise<void>;
  flushGoodbye?: () => Promise<void>;
};

/** Where a connection's logoff ended. */
export type LogoffState =
  | 'logoff-attempted'
  | 'logoff-threw'
  | 'logoff-unconfirmed'
  | 'logoff-withheld';

/** The words each terminal state is reported with. */
const LOGOFF_WORDS: Record<Exclude<LogoffState, 'logoff-attempted'>, string> = {
  'logoff-threw': 'logoff failed',
  'logoff-unconfirmed': 'logoff not confirmed',
  'logoff-withheld': 'logoff not sent: a credential was refused',
};

const states = new WeakMap<object, LogoffState>();

/** A connection's logoff state, if a logoff was attempted or withheld. */
export function logoffStateOf(connection: object): LogoffState | undefined {
  return states.get(connection);
}

/** Lines naming what a connection still owns (its locks, its objects). */
type OwnedReporter = (connection: object) => readonly string[];
const reporters: OwnedReporter[] = [];

/** A soft-mode record registers how it names what a connection still owns. */
export function registerOwnedReporter(reporter: OwnedReporter): void {
  reporters.push(reporter);
}

/** What `connection` still owns, by every record; `[]` when nothing. */
export function whatIsLeft(connection: object): readonly string[] {
  return reporters.flatMap((reporter) => reporter(connection));
}

/**
 * A test's own logoff, finished: `disconnect()` writes it, and the
 * connection's `flushGoodbye()` — no bound, so no timer; it never rejects —
 * waits until SAP answered it or its transport failed. Nothing reads the
 * answer. SAP ends a security session only once it received the logoff
 * whole; a test file forced to end first (a force exit) closes the socket
 * before that, and the session stays in SM05 until its timeout
 * (measured on premise 2026-10-19). Sent once: a connection whose logoff was
 * attempted or withheld sends nothing again (a second `disconnect()` rejects,
 * connection 16.0.0). A throw is the caller's, after its state is recorded.
 */
export async function endTestConnection(connection: unknown): Promise<void> {
  const closable = connection as Closable | null | undefined;
  if (!closable || typeof closable.disconnect !== 'function') return;
  if (states.has(closable)) return;
  // After a credential refusal nothing is sent, a logoff included.
  if (markerExists()) {
    states.set(closable, 'logoff-withheld');
    return;
  }
  states.set(closable, 'logoff-attempted');
  try {
    await closable.disconnect();
    await closable.flushGoodbye?.();
  } catch (error) {
    states.set(closable, 'logoff-threw');
    throw error;
  }
  states.set(closable, 'logoff-unconfirmed');
}

const open = new Set<Closable>();

/** Remember a connection so it is closed when the test file ends. */
export function trackConnection<T>(connection: T): T {
  if (connection) open.add(connection as unknown as Closable);
  return connection;
}

/**
 * Close every connection this test file opened, each logoff sent once and
 * finished (`endTestConnection`). Every connection that still owns
 * something is reported with its logoff's words and what it owns, and the
 * close then fails the file naming it all; a connection that owns nothing
 * and whose logoff threw is only warned about, as before.
 */
export async function closeTrackedConnections(): Promise<void> {
  const closing = Array.from(open);
  open.clear();
  const left: string[] = [];
  for (const connection of closing) {
    if (typeof connection.disconnect !== 'function') continue;
    try {
      await endTestConnection(connection);
    } catch (error) {
      console.warn(
        `A test connection could not be closed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const owned = whatIsLeft(connection);
    if (owned.length === 0) continue;
    const state = states.get(connection);
    const words =
      state === undefined || state === 'logoff-attempted'
        ? 'logoff not confirmed'
        : LOGOFF_WORDS[state];
    const ending =
      state === 'logoff-withheld'
        ? "they end with SAP's own timeout"
        : "they end with this logoff if SAP received it, else with SAP's own timeout";
    const line = `${words}; still owned (${ending}): ${owned.join('; ')}`;
    console.warn(`A test connection: ${line}`);
    left.push(line);
  }
  if (left.length > 0) {
    throw new Error(
      `The test file left something owned on its connection: ${left.join(' | ')}`,
    );
  }
}
