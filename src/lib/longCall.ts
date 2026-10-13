/**
 * The listed long tools (spec §5.8, D56): a tool on the user-approved list
 * (`tools/long-handlers.json`) runs on an ABAP session of its own and takes
 * an optional `timeout` that ends its wait.
 *
 * One implementation, `runLongCall`, used by every registration path:
 *
 * - **its own connection** — opened through the fresh-connection path
 *   (`openFreshConnection`, §4.3): a sibling of a connection the server built,
 *   or the host's `freshConnection`; on an injected connection without one the
 *   call is refused with D20's words. Stateless; nothing the instance holds is
 *   touched. It is the server's (role `long`, the connection-ends registry);
 * - **what the timeout does is the call's mode** (`LongMode`, per tool in the
 *   approved list, measured on premise 2026-10-13): the call answers at once
 *   in that mode's fixed words, and then
 *   - `sync-write`: the request goes on — no signal, no socket closed, no
 *     `disconnect()` (a logoff or a closed socket under it kills it and loses
 *     its write); its answer is reported to no one; the logoff follows SAP's
 *     answer, and the terminal close waits for it (`untilAnswered`);
 *   - `async`: the poll stops (`longCallWaitEnded`), the answer names the run
 *     the tool holds, and the connection is logged off at once — the run
 *     survives that logoff;
 *   - `sync-read`: the connection is logged off at once, which cuts the read;
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
import {
  type LongCallProgress,
  type LongMode,
  type TimedOutAnswer,
  timedOutAnswer,
  withLongCallProgress,
} from './longTools';
import { endConnection, own, untilAnswered } from './ownedConnections';
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
  /** What the timeout does to the work (`longToolMode`). */
  mode: LongMode;
  /** The handler, on the call's own connection. */
  run: (connection: IAbapConnection) => Promise<R>;
}

/**
 * Runs a listed long call (see the file header): its own connection, the
 * optional `timeout` on the wait only, the logoff after SAP's answer.
 */
export async function runLongCall<R>(
  options: LongCallOptions<R>,
): Promise<R | TimedOutAnswer> {
  const { name, logger, timeoutSeconds, mode } = options;
  const connection = await openFreshConnection(options.connection, logger);
  own(connection, { role: 'long' });
  // Stateless (§5.7): a fresh connection is, and a host's factory's is made so.
  const typed = connection as { setSessionType?: (type: string) => void };
  if (typeof typed.setSessionType === 'function') {
    typed.setSessionType('stateless');
  }

  const progress: LongCallProgress = { ids: new Map(), waitEnded: false };
  const work = withLongCallProgress(progress, () => options.run(connection));
  const answered = work.then(
    () => undefined,
    () => undefined,
  );
  // Only a sync-write request is waited for by the terminal close: an async
  // run survives a logoff, and a read may be cut.
  if (mode === 'sync-write') untilAnswered(connection, answered);
  // The logoff, once the call's work settled — on every path, whoever waits.
  const ended = answered.then(() => closeQuietly(connection, logger, name));

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
      logger?.info(`${name}: the wait was ended by its timeout`);
      progress.waitEnded = true;
      const answer = timedOutAnswer(timeoutSeconds, mode, progress.ids);
      if (mode !== 'sync-write') {
        // The run survives it (async), the read is cut (sync-read).
        await endConnection(connection, () => {
          logger?.warn(`${name}: could not close its own connection`);
        });
      }
      return answer;
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
