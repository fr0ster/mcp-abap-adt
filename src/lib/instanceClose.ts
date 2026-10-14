/**
 * **The instance close** (spec §6.4, D51): how an instance ends when its
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
 *    the locks — and **every call of the instance is interrupted**: its
 *    signal aborts, a call queued in its main flow leaves without sending.
 *    A running tool's later requests fail against the ended session, and
 *    nobody reads their answer. Awaited only to each logoff's write;
 * 3. the state let go (`letGoOfState`): no idle bound any more, nothing
 *    undone — the logoff ended in SAP what the state held;
 * 4. the MCP server and its transport closed, awaited.
 *
 * From the latch on the instance opens no new connection (`own()`,
 * `refuseIfClosed`, `refuseWhenClosed` in `ownedConnections.ts`): the sweep
 * in step 2 runs once, so nothing opened after it could be logged off.
 *
 * A background run is not the instance's (its connection is the host
 * strategy's): it runs on until SAP answers; the process's end logs it off.
 */

import { interrupt, latch } from './activeTools';
import { closeOwnedConnections } from './ownedConnections';

/** What the instance close drives: `BaseMcpServer`, seen structurally. */
export interface ClosableInstance {
  /** The state let go after the logoffs: no bound, nothing undone. */
  letGoOfState(): void;
  close(): Promise<void>;
}

const closes = new WeakMap<object, Promise<void>>();

/** Closes `instance` (see above); never rejects. A second call joins the first. */
export function closeInstance(instance: ClosableInstance): Promise<void> {
  const running = closes.get(instance);
  if (running) return running;
  latch(instance);
  const written = closeOwnedConnections(instance);
  interrupt(instance);
  const closing = (async () => {
    await written;
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
