/**
 * Connections a test file opened, closed when it ends.
 *
 * A connection that connected must disconnect: `disconnect()` sends the logoff
 * that ends its HTTP security session. Without it every test file left its
 * session in SM05 until the server's timeout — one per file, and nothing in the
 * helpers ever closed one (E19, 2026-09-27). The ABAP session of a stateless
 * request ends with the request; the HTTP session, and a stateful context
 * inside it, do not.
 *
 * Kept free of other imports so the setup file that closes them loads nothing
 * else.
 */
type Closable = { disconnect?: () => Promise<void> };

const open = new Set<Closable>();

/** Remember a connection so it is closed when the test file ends. */
export function trackConnection<T>(connection: T): T {
  if (connection) open.add(connection as unknown as Closable);
  return connection;
}

/** Close every connection this test file opened; a failure to close is only logged. */
export async function closeTrackedConnections(): Promise<void> {
  const closing = Array.from(open);
  open.clear();
  for (const connection of closing) {
    if (typeof connection.disconnect !== 'function') continue;
    try {
      await connection.disconnect();
    } catch (error) {
      console.warn(
        `A test connection could not be closed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
