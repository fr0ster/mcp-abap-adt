/**
 * The listed long tools: a tool on the user-approved list
 * (`tools/long-handlers.json`) — a read — runs on an ABAP session of its own
 * and takes an optional `timeout` that cuts the read.
 *
 * One implementation, `runLongCall`, used by every registration path:
 *
 * - **its own connection** — opened through the fresh-connection path
 *   (`openFreshConnection`): a sibling of a connection the server built,
 *   or the host's `freshConnection`; on an injected connection without one the
 *   call is refused with its fixed words. Stateless; nothing the instance holds is
 *   touched. It is the server's (role `long`, the connection-ends registry);
 * - **the timeout cuts the read**: when it passes, the call's own connection
 *   is logged off at once (`disconnect()`), and the call answers in fixed
 *   words that the request was cancelled and nothing was changed. A listed
 *   tool only reads, so nothing is lost;
 * - **on a normal end** — in time, or without a `timeout` — the logoff comes
 *   after the call's answer, on every path;
 * - **the timer is the call's own**, cleared when the call settles: no timer
 *   is left pending after a call, timed out or not.
 *
 * No default: without a `timeout` the call waits until SAP answers. The
 * request carries no client-side deadline of the server's either.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from './handlers/interfaces';
import { type TimedOutAnswer, timedOutAnswer } from './longTools';
import { endConnection, own } from './ownedConnections';
import { closeQuietly, openFreshConnection } from './packageSessions';

type Logger = HandlerContext['logger'];

export interface LongCallOptions<R> {
  /** The tool's name, for the close's fixed words. */
  name: string;
  /** The instance's connection: what the call's own one is opened from. */
  connection: IAbapConnection;
  logger: Logger;
  /** Seconds, already read (`readTimeout`); `undefined`: wait until done. */
  timeoutSeconds: number | undefined;
  /** The handler, on the call's own connection. */
  run: (connection: IAbapConnection) => Promise<R>;
}

/**
 * Runs a listed long call (see the file header): its own connection, the
 * optional `timeout` that cuts the read, the logoff.
 */
export async function runLongCall<R>(
  options: LongCallOptions<R>,
): Promise<R | TimedOutAnswer> {
  const { name, logger, timeoutSeconds } = options;
  const connection = await openFreshConnection(options.connection, logger);
  own(connection, { role: 'long' });
  // Stateless: a fresh connection is, and a host's factory's is made so.
  const typed = connection as { setSessionType?: (type: string) => void };
  if (typeof typed.setSessionType === 'function') {
    typed.setSessionType('stateless');
  }

  const work = options.run(connection);
  // The logoff once the call's work settled — on every path, whoever waits.
  const ended = work.then(
    () => closeQuietly(connection, logger, name),
    () => closeQuietly(connection, logger, name),
  );

  if (timeoutSeconds === undefined) {
    try {
      return await work;
    } finally {
      await ended;
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const waitEnded = new Promise<'timed-out'>((resolve) => {
    timer = setTimeout(() => resolve('timed-out'), timeoutSeconds * 1000);
  });
  try {
    const first = await Promise.race([work, waitEnded]);
    if (first === 'timed-out') {
      // The read is cut: its session is logged off now, under the request.
      logger?.info(`${name}: the read was cut by its timeout`);
      await endConnection(connection, () => {
        logger?.warn(`${name}: could not close its own connection`);
      });
      return timedOutAnswer(timeoutSeconds);
    }
    await ended;
    return first as R;
  } catch (error) {
    await ended;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
