/**
 * The listed long tools in the call: a tool on the user-approved list
 * (`tools/long-handlers.json`) — a read — called with `background: false`,
 * or on an instance whose host gave no background-run strategy, runs in the
 * call on an ABAP session of its own.
 *
 * One implementation, `runLongCall`, used by every registration path:
 *
 * - **its own connection** — opened through the fresh-connection path
 *   (`openFreshConnection`): a sibling of a connection the server built,
 *   or the host's `freshConnection`; on an injected connection without one the
 *   call is refused with its fixed words. Stateless; nothing the instance holds is
 *   touched. It is the server's (role `long`, the connection-ends registry);
 * - **the logoff comes after the call's answer**, on every path.
 *
 * No deadline: the call waits until SAP answers. The request carries no
 * client-side deadline of the server's either. A read in the background is
 * `backgroundRuns/run.ts`'s, on the run's one connection — never this.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from './handlers/interfaces';
import { own } from './ownedConnections';
import { closeQuietly, openFreshConnection } from './packageSessions';

type Logger = HandlerContext['logger'];

export interface LongCallOptions<R> {
  /** The tool's name, for the close's fixed words. */
  name: string;
  /** The instance's connection: what the call's own one is opened from. */
  connection: IAbapConnection;
  logger: Logger;
  /** The handler, on the call's own connection. */
  run: (connection: IAbapConnection) => Promise<R>;
}

/**
 * Runs a listed long call in the call (see the file header): its own
 * connection, logged off after the answer.
 */
export async function runLongCall<R>(options: LongCallOptions<R>): Promise<R> {
  const { name, logger } = options;
  const connection = await openFreshConnection(options.connection, logger);
  own(connection, { role: 'long' });
  // Stateless: a fresh connection is, and a host's factory's is made so.
  connection.setSessionType('stateless');
  try {
    return await options.run(connection);
  } finally {
    await closeQuietly(connection, logger, name);
  }
}
