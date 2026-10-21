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
 * Kept free of other imports so the setup file that closes them loads nothing
 * else.
 */
type Closable = {
  disconnect?: () => Promise<void>;
  flushGoodbye?: () => Promise<void>;
};

/**
 * A test's own logoff, finished: `disconnect()` writes it, and the
 * connection's `flushGoodbye()` — no bound, so no timer; it never rejects —
 * waits until SAP answered it or its transport failed. Nothing reads the
 * answer. SAP ends a security session only once it received the logoff
 * whole; a test file that ends first (Jest's `--forceExit`) closes the
 * socket before that, and the session stays in SM05 until its timeout
 * (measured on premise 2026-10-19).
 */
export async function endTestConnection(connection: unknown): Promise<void> {
  const closable = connection as Closable | null | undefined;
  if (!closable || typeof closable.disconnect !== 'function') return;
  await closable.disconnect();
  await closable.flushGoodbye?.();
}

const open = new Set<Closable>();

/** Remember a connection so it is closed when the test file ends. */
export function trackConnection<T>(connection: T): T {
  if (connection) open.add(connection as unknown as Closable);
  return connection;
}

/**
 * Close every connection this test file opened, each logoff finished
 * (`endTestConnection`); a failure to close is only logged.
 */
export async function closeTrackedConnections(): Promise<void> {
  const closing = Array.from(open);
  open.clear();
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
  }
}
