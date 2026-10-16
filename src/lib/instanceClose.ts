/**
 * **The instance close**: how an instance ends when its
 * client closed its connection — a transport close that ends the session
 * (`BaseMcpServer` wires its protocol's `onclose` here unless the host states
 * `transportCloseEndsSession: false`: stdio's transport, an SSE stream, an
 * embedder's connected transport), an SSE stream that closed, an embedder's
 * own close. One promise per instance; a second caller joins it, so the
 * launchers' and the SSE wrapper's closes add nothing: no second logoff.
 *
 * In this order, nothing waiting for a running tool:
 *
 * 1. `latch(instance)` — synchronous, in the tick the close begins: a call
 *    routed to the instance from here on is refused before any connection;
 * 2. in the same tick, **the logoffs at once** — every connection the
 *    instance owns (its connector, held state's — the debugger's —, long
 *    reads' and lock sessions' fresh ones) gets its logoff, which releases
 *    the locks — the background runs it started included
 *    (`cutBackgroundRuns`) — and **every call of the instance is interrupted**: its
 *    signal aborts, a call queued in its main flow leaves without sending.
 *    A running tool's later requests fail against the ended session, and
 *    nobody reads their answer. In the same tick **the open batch is
 *    dropped** (`dropBatch`): nothing recorded is sent, the batch's signal
 *    aborts — every recorded handler's wait for its parts ends —, and the
 *    batch connection and the last batch's answers are let go. Awaited only
 *    to each logoff's write;
 * 3. the state let go (`letGoOfState`): no idle bound any more, nothing
 *    undone — the logoff ended in SAP what the state held;
 * 4. the MCP server and its transport closed, awaited.
 *
 * From the latch on the instance opens no new connection (`own()`,
 * `refuseIfClosed`, `refuseWhenClosed` in `ownedConnections.ts`): the sweep
 * in step 2 runs once, so nothing opened after it could be logged off.
 *
 * A background run's connection is the host strategy's, but the instance
 * close cuts the runs this instance started (`cutBackgroundRuns`): their
 * connections get their logoff in step 2's tick, as at the process's end —
 * one still connecting too (tracked from its birth; connection 17 queues the
 * logoff behind the connect), and the run's start is then refused.
 * Another instance's runs are untouched.
 */

import { interrupt, latch } from './activeTools';
import { closeOwnedConnections } from './ownedConnections';

/** What the instance close drives: `BaseMcpServer`, seen structurally. */
export interface ClosableInstance {
  /** The state let go after the logoffs: no bound, nothing undone. */
  letGoOfState(): void;
  /**
   * The logoff of every background run's connection this instance started,
   * at once; resolves once each is written. Absent: none to cut.
   */
  cutBackgroundRuns?(): Promise<void>;
  /**
   * Drops the instance's open batch with nothing sent — its signal aborted,
   * the batch connection and the answers let go — synchronously. Absent:
   * no batch to drop.
   */
  dropBatch?(): void;
  close(): Promise<void>;
}

const closes = new WeakMap<object, Promise<void>>();

/** Closes `instance` (see above); never rejects. A second call joins the first. */
export function closeInstance(instance: ClosableInstance): Promise<void> {
  const running = closes.get(instance);
  if (running) return running;
  latch(instance);
  const written = closeOwnedConnections(instance);
  let cut: Promise<void> = Promise.resolve();
  try {
    cut = instance.cutBackgroundRuns?.() ?? cut;
  } catch {
    // Nothing to cut: the instance's own logoffs are written either way.
  }
  try {
    instance.dropBatch?.();
  } catch {
    // Dropping sends nothing: the logoffs are written either way.
  }
  interrupt(instance);
  const closing = (async () => {
    await Promise.all([written, cut.catch(() => undefined)]);
    try {
      instance.letGoOfState();
    } catch {
      // Letting go changes nothing in SAP: the logoffs are written.
    }
    try {
      await instance.close();
    } catch {
      // The MCP server's own close: its transport is gone either way.
    }
  })();
  closes.set(instance, closing);
  return closing;
}

/** Whether `instance`'s close has begun. */
export function isClosing(instance: object): boolean {
  return closes.has(instance);
}
