/**
 * Every connection the server owns ends with a logoff: the
 * connection-ends registry.
 *
 * A connection the server builds, or takes ownership of (a consumer's
 * `freshConnection` one once returned), is recorded here at once, with
 * the server instance it belongs to and its role. It ends through
 * `endConnection` alone: `disconnect()` — the logoff, which releases the
 * locks its SAP session holds — called **once** whoever asks (connection 16
 * rejects a second call), a second caller joining the first; a failure is
 * logged in fixed words and never thrown. On connection 16 `disconnect()`
 * resolves once the logoff is **written** to the socket, not answered,
 * so nothing here waits on SAP.
 *
 * Three ends read it:
 *
 * - **the terminal close** (`closeOwnedConnections(instance)`): every
 *   connection the instance owns — the one it built, held state's own,
 *   package lock sessions, fresh connections still open. The instance close
 *   (`closeInstance`: an SSE stream that closed, an embedder's close) runs
 *   it at once, under the requests in flight, without a state undo; the
 *   pool's eviction and the idle bound run it after their undo, whatever
 *   the undo answered;
 * - **the process's logoffs** (`forceClose()`): every connection the
 *   process owns, the background runs' included, awaiting nothing that
 *   waits on a tool, a request or a state undo — the process shutdown
 *   (stdio's client close included) runs it at once (`logOffAtOnce`), and
 *   the forced close again;
 * - each site's own end (a fresh connection when its operation ends, a lock
 *   session at its unlock, the debugger's at its stop).
 *
 * An injected connection is never recorded: it is the consumer's to close.
 * Which instance owns a connection a tool opens is the instance whose call
 * runs (`runAsOwner`, entered by the tool wrapper); outside any call, none —
 * the forced close still reaches it.
 *
 * **A closed instance owns nothing new.** Once its owner is latched — the
 * instance's close (`latch(instance)`) or the process's shutdown (`latch()`)
 * began — the terminal close has already swept what it owned, so nothing
 * opened after would ever be logged off. Every site that opens a connection
 * asks `refuseIfClosed()` before it builds or logs on anything, and `own()`
 * refuses too: the connection is ended at once (its logoff, when it holds a
 * session) and `ClosedInstanceRefusal` is thrown. A connection whose
 * `connect()` was under way when the latch closed was swept with the rest
 * (connection 17 queues its logoff behind the connect); the site asks
 * `refuseWhenClosed(connection)` once the connect settled, so the caller gets
 * the refusal, never a connection whose session is gone.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { isLatched } from './activeTools';
import { ClosedInstanceRefusal } from './auth/failures';

/** What an owned connection is to its instance. */
export type ConnectionRole =
  /** The instance's own, built from its source (`BaseMcpServer.getConnection`). */
  | 'built'
  /** Opened for one operation (`openFreshConnection`, `inOwnSessionOverRfc`). */
  | 'fresh'
  /** Holding a package lock until its unlock (`connectionForPackageLock`). */
  | 'lock'
  /** Held state's own (the debugger's sessions). */
  | 'state'
  /** A listed long tool's own, for one read (`runLongCall`). */
  | 'long'
  /**
   * A background run's own, until SAP answers (`startBackgroundRun`): owned
   * by the host's strategy, not an instance — no instance's terminal close
   * cuts it; the instance close of the instance that started it
   * (`cutBackgroundRuns`) and the process's logoffs (`forceClose`) do.
   */
  | 'background';

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
/**
 * Who wants to know a connection's logoff was WRITTEN (its `disconnect()`
 * resolved): the leftover-session files, deleted only then. Run inside the
 * end itself, so the forced close, which awaits every end, awaits them too.
 */
const logoffListeners = new WeakMap<OwnedConnection, Array<() => void>>();
/**
 * Logoffs asked for and not yet written: a connection leaves `owned` when
 * its end begins, and stays here until its `disconnect()` settles, so the
 * forced close awaits a logoff already under way instead of exiting before
 * it is written.
 */
const writing = new Set<Promise<void>>();
/**
 * The same logoffs, per owner: a terminal close that comes after another
 * end of the instance began (its transport's close, then a host's
 * `terminalClose()`) joins them, so it too resolves only once they are
 * written.
 */
const writingFor = new WeakMap<object, Set<Promise<void>>>();
/**
 * Logoffs written and not yet answered: each followed through the
 * connection's `flushGoodbye()` — with no bound, so the connection sets no
 * timer — until SAP's answer or its transport's failure; nothing reads the
 * answer. SAP ends a security session, and every user session in it, only
 * once it has received the logoff request whole (`CL_HTTP_EXT_LOGOFF`); a
 * socket closed before that ends nothing (measured on premise 2026-10-19:
 * sessions whose logoff went out right before the process ended stayed in
 * SM05 until their timeout). The orderly end and an instance's terminal
 * close wait for them; the forced close does not.
 */
const answering = new Set<Promise<void>>();
/** The same, per owner. */
const answeringFor = new WeakMap<object, Set<Promise<void>>>();
const ownerScope = new AsyncLocalStorage<object>();
/** Each recorded connection's owner, kept past its end for `refuseWhenClosed`. */
const owners = new WeakMap<OwnedConnection, object | undefined>();

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
  const owner = options.owner ?? known?.owner ?? currentOwner();
  owners.set(connection, owner);
  if (isLatched(owner)) {
    // Its owner's terminal close already ran: nothing would end it later.
    void endConnection(connection);
    throw new ClosedInstanceRefusal(isLatched());
  }
  owned.set(connection, { owner, role: options.role });
}

/**
 * Throws `ClosedInstanceRefusal` when `owner` — by default the instance whose
 * call runs; outside any call, the process — is latched closed. Asked by every
 * site before it builds or logs on a connection: nothing is sent.
 */
export function refuseIfClosed(
  owner: object | undefined = currentOwner(),
): void {
  if (isLatched(owner)) throw new ClosedInstanceRefusal(isLatched());
}

/**
 * Asked once a recorded connection's `connect()` settled: when its owner was
 * latched closed meanwhile, the connection is ended (joined, if the terminal
 * close already asked for its logoff) and `ClosedInstanceRefusal` thrown.
 */
export function refuseWhenClosed(connection: object): void {
  if (!owners.has(connection)) return;
  if (!isLatched(owners.get(connection))) return;
  void endConnection(connection);
  throw new ClosedInstanceRefusal(isLatched());
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
 * Calls `listener` once `connection`'s logoff is written — its one
 * `disconnect()` resolved — and never when that `disconnect()` failed. Run
 * synchronously inside the end, before the end's promise settles, so
 * whoever awaits the end (the terminal close, the forced close) awaits it.
 * A connection whose end already began is not followed: its listener never
 * runs.
 */
export function whenLoggedOff(connection: object, listener: () => void): void {
  if (ending.has(connection)) return;
  const listeners = logoffListeners.get(connection) ?? [];
  listeners.push(listener);
  logoffListeners.set(connection, listeners);
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
      logoffListeners.delete(connection);
      try {
        onFailure();
      } catch {
        // A reporter that throws changes nothing of the close.
      }
      return;
    }
    followAnswer(connection);
    const written = logoffListeners.get(connection) ?? [];
    logoffListeners.delete(connection);
    for (const listener of written) {
      try {
        listener();
      } catch {
        // A listener that throws changes nothing of the close.
      }
    }
  })();
  ending.set(connection, closing);
  writing.add(closing);
  const owner = owners.get(connection);
  const ofOwner =
    owner === undefined ? undefined : (writingFor.get(owner) ?? new Set());
  if (owner !== undefined && ofOwner !== undefined) {
    ofOwner.add(closing);
    writingFor.set(owner, ofOwner);
  }
  void closing.finally(() => {
    writing.delete(closing);
    ofOwner?.delete(closing);
  });
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

/** Follows a written logoff until it is answered or its transport fails (`answering`). */
function followAnswer(connection: object): void {
  const flush = (connection as { flushGoodbye?: () => Promise<void> })
    .flushGoodbye;
  if (typeof flush !== 'function') return;
  const answered = (async () => {
    try {
      await flush.call(connection);
    } catch {
      // The library's flush never rejects; a stand-in that does ends the wait.
    }
  })();
  answering.add(answered);
  const owner = owners.get(connection);
  const ofOwner =
    owner === undefined ? undefined : (answeringFor.get(owner) ?? new Set());
  if (owner !== undefined && ofOwner !== undefined) {
    ofOwner.add(answered);
    answeringFor.set(owner, ofOwner);
  }
  void answered.finally(() => {
    answering.delete(answered);
    ofOwner?.delete(answered);
  });
}

/**
 * Resolves once every logoff written so far — of `owner`, or of the whole
 * process — has been answered or its transport failed. Nothing reads the
 * answer; no timer.
 */
export async function logoffsAnswered(owner?: object): Promise<void> {
  const pendingNow =
    owner === undefined ? [...answering] : [...(answeringFor.get(owner) ?? [])];
  await Promise.all(pendingNow);
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
 * **The terminal close**: `disconnect()` of every
 * connection `instance` owns — or only those of `roles` — each once; a
 * failure logged in fixed words. Never conditional on a state undo: the
 * instance close runs it with none, the pool and the idle bound after
 * theirs, whatever it answered. Resolves once each logoff is written — the
 * whole close (no `roles`) also joins the instance's logoffs already under
 * way, never a second `disconnect()`; it waits for no request in flight. An
 * injected connection was never recorded, so it is never closed.
 */
export async function closeOwnedConnections(
  instance: object,
  roles?: readonly ConnectionRole[],
): Promise<void> {
  const under =
    roles === undefined ? [...(writingFor.get(instance) ?? [])] : [];
  await Promise.all([
    ...ownedConnections(instance, roles).map((connection) =>
      endConnection(connection),
    ),
    ...under,
  ]);
  // The whole close lets the instance's logoffs finish: each answered, or
  // its transport failed.
  if (roles === undefined) await logoffsAnswered(instance);
}

/**
 * **The process's logoffs**: the logoff of every connection the
 * process owns, each `disconnect()` joined if one is already under way. It
 * awaits nothing that waits on a tool, a request, an instance close or a
 * state undo — only each logoff's write (connection 16). The process
 * shutdown runs it at once (`logOffAtOnce`), the forced close again.
 */
export async function forceClose(): Promise<void> {
  const owned_ = ownedConnections().map((connection) =>
    endConnection(connection),
  );
  // Every logoff under way too — joined, never a second `disconnect()`.
  await Promise.all([...owned_, ...writing]);
}
