/**
 * Every connection the server owns ends with a logoff (spec §6.4, D55): the
 * connection-ends registry.
 *
 * A connection the server builds, or takes ownership of (a consumer's
 * `freshConnection` one once returned, D22), is recorded here at once, with
 * the server instance it belongs to and its role. It ends through
 * `endConnection` alone: `disconnect()` — the logoff, which releases the
 * locks its SAP session holds — called **once** whoever asks (connection 16
 * rejects a second call), a second caller joining the first; a failure is
 * logged in fixed words and never thrown. On connection 16 `disconnect()`
 * resolves once the logoff is **written** to the socket, not answered (D56),
 * so nothing here waits on SAP.
 *
 * Three ends read it:
 *
 * - **the terminal close** (`closeOwnedConnections(instance)`): every
 *   connection the instance owns — the one it built, held state's own,
 *   package lock sessions, fresh connections still open — run by every
 *   terminal disposal after the state undo, whatever the undo answered;
 * - **the forced close** (`forceClose()`): every connection the process
 *   owns, awaiting nothing that waits on a tool, a request or a state undo;
 * - each site's own end (a fresh connection when its operation ends, a lock
 *   session at its unlock, the debugger's at its stop).
 *
 * An injected connection is never recorded: it is the consumer's to close.
 * Which instance owns a connection a tool opens is the instance whose call
 * runs (`runAsOwner`, entered by the tool wrapper); outside any call, none —
 * the forced close still reaches it.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** What an owned connection is to its instance. */
export type ConnectionRole =
  /** The instance's own, built from its source (`BaseMcpServer.getConnection`). */
  | 'built'
  /** Opened for one operation (`openFreshConnection`, `inOwnSessionOverRfc`). */
  | 'fresh'
  /** Holding a package lock until its unlock (`connectionForPackageLock`). */
  | 'lock'
  /** Held state's own (the debugger's sessions). */
  | 'state';

/** A connection, as the registry keeps it: any object with an optional `disconnect()`. */
type OwnedConnection = object;

interface Owned {
  owner: object | undefined;
  role: ConnectionRole;
}

/** Owned and not yet ended, in creation order. */
const owned = new Map<OwnedConnection, Owned>();
/** Each `disconnect()` asked for, so a second caller joins it. */
const ending = new WeakMap<OwnedConnection, Promise<void>>();
const endListeners = new WeakMap<OwnedConnection, Array<() => void>>();
const ownerScope = new AsyncLocalStorage<object>();

/** The fixed words of a close that failed. */
export const CLOSE_FAILED_WORDS =
  '[MCP] A connection the server owns could not be closed (its logoff was not written)';

/** Runs `fn` with `owner` as the instance a connection opened inside belongs to. */
export function runAsOwner<T>(owner: object, fn: () => T): T {
  return ownerScope.run(owner, fn);
}

/** The instance whose call this code runs for; `undefined` outside any call. */
export function currentOwner(): object | undefined {
  return ownerScope.getStore();
}

/**
 * Records `connection` as the server's own: its instance (`owner`, else the
 * instance whose call runs) and its role. Recording it again changes its role
 * (a fresh connection the debugger keeps becomes the state's). An ended
 * connection is not recorded again.
 */
export function own(
  connection: object,
  options: { role: ConnectionRole; owner?: object | undefined },
): void {
  if (ending.has(connection)) return;
  const known = owned.get(connection);
  owned.set(connection, {
    owner: options.owner ?? known?.owner ?? currentOwner(),
    role: options.role,
  });
}

/** Whether `connection` was ended here (its `disconnect()` was asked for). */
export function isEnded(connection: object): boolean {
  return ending.has(connection);
}

/** Calls `listener` once `connection` ends (now, if it already has). */
export function whenEnded(connection: object, listener: () => void): void {
  if (ending.has(connection)) {
    listener();
    return;
  }
  const listeners = endListeners.get(connection) ?? [];
  listeners.push(listener);
  endListeners.set(connection, listeners);
}

/**
 * Ends `connection`: `disconnect()` once, joined by any later caller; a
 * failure is reported through `onFailure` (default: one stderr line in fixed
 * words), never thrown. Resolves when the logoff is written (connection 16).
 */
export function endConnection(
  connection: object,
  onFailure: () => void = () => {
    process.stderr.write(`${CLOSE_FAILED_WORDS}\n`);
  },
): Promise<void> {
  const running = ending.get(connection);
  if (running) return running;
  owned.delete(connection);
  const closable = connection as { disconnect?: () => Promise<void> };
  const closing = (async () => {
    try {
      if (typeof closable.disconnect === 'function') {
        await closable.disconnect();
      }
    } catch {
      try {
        onFailure();
      } catch {
        // A reporter that throws changes nothing of the close.
      }
    }
  })();
  ending.set(connection, closing);
  const listeners = endListeners.get(connection) ?? [];
  endListeners.delete(connection);
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A listener that throws changes nothing of the close.
    }
  }
  return closing;
}

/** The connections `owner` owns and has not ended (every owner's: none given). */
export function ownedConnections(
  owner?: object,
  roles?: readonly ConnectionRole[],
): object[] {
  return [...owned]
    .filter(
      ([, entry]) =>
        (owner === undefined || entry.owner === owner) &&
        (roles === undefined || roles.includes(entry.role)),
    )
    .map(([connection]) => connection);
}

/**
 * **The terminal close** (spec §6.4, D51, D55): `disconnect()` of every
 * connection `instance` owns — or only those of `roles` — each once; a
 * failure logged in fixed words. Never conditional on the state undo: every
 * terminal disposal runs it after the undo was tried, whatever it answered.
 * An injected connection was never recorded, so it is never closed.
 */
export async function closeOwnedConnections(
  instance: object,
  roles?: readonly ConnectionRole[],
): Promise<void> {
  await Promise.all(
    ownedConnections(instance, roles).map((connection) =>
      endConnection(connection),
    ),
  );
}

/**
 * **The forced close** (spec §6.4): the logoff of every connection the
 * process owns, each `disconnect()` joined if one is already under way. It
 * awaits nothing that waits on a tool, a request, an instance close or a
 * state undo — only each logoff's write (connection 16).
 */
export async function forceClose(): Promise<void> {
  await Promise.all(
    ownedConnections().map((connection) => endConnection(connection)),
  );
}
