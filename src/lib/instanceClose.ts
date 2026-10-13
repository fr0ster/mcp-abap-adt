/**
 * **The instance close** (spec §6.4, D51): how an instance ends when its
 * consumer let it go — an SSE connection that closed, a launcher's shutdown.
 * One promise per instance; a second caller joins it.
 *
 * In this order:
 *
 * 1. `latch(instance)` — synchronous, in the tick the close begins: a call
 *    routed to the instance from here on is refused before any connection;
 * 2. await `settled(instance)` — its calls run to their end, none aborted
 *    (D55; the SDK's transport close aborts their `extra.signal`, which ends
 *    only their waits);
 * 3. `shutdownState()` — the state undo (main's), its leftovers answered;
 * 4. **the terminal close**, whatever the undo answered — every connection
 *    the instance owns closed with a logoff;
 * 5. the MCP server and its transport closed, awaited.
 *
 * The forced close (`forceClose`) awaits none of this.
 */

import { latch, settled } from './activeTools';
import { closeOwnedConnections } from './ownedConnections';

/** What the instance close drives: `BaseMcpServer`, seen structurally. */
export interface ClosableInstance {
  shutdownState(): Promise<string[]>;
  close(): Promise<void>;
}

const closes = new WeakMap<object, Promise<string[]>>();

/** The words of a state undo that threw instead of answering. */
const UNDO_THREW = 'the state could not be shut down';

/**
 * Closes `instance` (see above) and answers what its state undo could not
 * undo; never rejects. A second call joins the first.
 */
export function closeInstance(instance: ClosableInstance): Promise<string[]> {
  const running = closes.get(instance);
  if (running) return running;
  latch(instance);
  const closing = (async () => {
    await settled(instance);
    let left: string[];
    try {
      left = await instance.shutdownState();
    } catch {
      left = [UNDO_THREW];
    }
    await closeOwnedConnections(instance);
    try {
      await instance.close();
    } catch {
      // The MCP server's own close: its transport is gone either way.
    }
    return left;
  })();
  closes.set(instance, closing);
  return closing;
}

/** Whether `instance`'s close has begun. */
export function isClosing(instance: object): boolean {
  return closes.has(instance);
}
