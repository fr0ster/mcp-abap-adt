/**
 * Package saves, each in an ABAP session no earlier save has used.
 *
 * A package created or updated in an ABAP session cannot be changed again by
 * that session: SAP answers PAK/058 "Package … is already locked". It is not
 * an enqueue. `CL_PACKAGE` keeps its instances in a static buffer for the life
 * of the session, a save leaves the instance `requested`, and
 * `CL_PAK_ADT_PERSIST` meets it in `set_changeable` on the next modify or
 * delete. No ADT call resets it (docs/installation/RFC_SETUP.md,
 * fr0ster/mcp-abap-adt-clients#176).
 *
 * So a package can be saved only once per ABAP session. The server holds one
 * connection across calls: over RFC one session for everything, so after
 * CreatePackage the next update was refused; over HTTP one stateful session
 * for every lock → update → unlock, so the second update was refused (on premise,
 * 2026-09-27, both). The workaround is the consumer's, and this is it: the
 * server's own session never saves a package.
 *
 * - A create over RFC runs on a fresh connection, closed when it answers. Over
 *   HTTP a create is a stateless request already, its session ends with it.
 * - A lock, on either transport, takes a fresh connection and keeps it under
 *   its lock handle; the update with that handle runs on it; the unlock
 *   releases it and closes it. The handle belongs to the session that took
 *   it, so the whole lock → update → unlock chain has to share that session.
 *
 * Where a fresh connection comes from is `openFreshConnection` (spec §4.3,
 * D20): the factory's record of a connection the server built, or the host's
 * `freshConnection` for one it injected — never the connection's own
 * configuration. Without either the operation is refused.
 *
 * Every fresh connection is the server's from the moment it exists (D22,
 * D55): recorded in the connection-ends registry (`ownedConnections.ts`) as
 * the calling instance's, and ended with its one `disconnect()` — the logoff —
 * when its operation ends, on every path, or by the instance's terminal close.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { ServerRefusal } from './auth/serverRefusal';
import { createAbapConnection, siblingRecordOf } from './connectionFactory';
import { isRfcConnection } from './connectionKind';
import type { HandlerContext } from './handlers/interfaces';
import { endConnection, own, whenEnded } from './ownedConnections';

type Logger = HandlerContext['logger'];

/**
 * The host's factory of fresh connections (spec §4.3, D20): a connection of
 * its own, built by the host with its credential. It receives no signal
 * (D56): a fresh connection is made inside a started tool, which runs to its
 * end. Once returned it is the server's (D22): held for the operation or
 * under a package lock's handle, then closed with `disconnect()`.
 */
export type FreshConnectionFactory = () => Promise<IAbapConnection>;

/** Injected connections whose host gave a fresh-connection factory. */
const hostFactories = new WeakMap<object, FreshConnectionFactory>();

/**
 * Records what the host gave beside the connection it injected
 * (`EmbeddableMcpServer`'s `freshConnection`): its factory, or none. The
 * latest injection of a connection object decides — one injected again
 * without a factory forgets the earlier one, and a fresh connection on it is
 * refused. Keyed weakly: a connection the host drops is not kept.
 */
export function registerFreshConnectionFactory(
  connection: object,
  factory: FreshConnectionFactory | undefined,
): void {
  if (factory) hostFactories.set(connection, factory);
  else hostFactories.delete(connection);
}

/**
 * A connection of its own, ready for requests, decided from a registry keyed
 * by the connection object — never from the connection's configuration
 * (spec §4.3, D20):
 *
 * - built by the server (`createAbapConnection`) → the factory's record: the
 *   same settings and the same credential object, connected here (closed if
 *   that fails);
 * - injected with the host's `freshConnection` → that factory, called with
 *   no argument (D56); what it returns is the server's (D22), connected here
 *   like the server's own;
 * - anything else → refused `fresh_connection_unavailable`, nothing sent.
 */
export async function openFreshConnection(
  connection: IAbapConnection,
  logger: Logger,
): Promise<IAbapConnection> {
  const record = siblingRecordOf(connection);
  if (record) {
    const built = createAbapConnection(
      record.settings,
      record.credential,
      logger ?? null,
    );
    own(built, { role: 'fresh' });
    return connectedOrClosed(built, logger);
  }
  const factory = hostFactories.get(connection);
  if (!factory) throw new ServerRefusal('fresh_connection_unavailable');
  // Once handed over it is the server's (D22), treated exactly like a
  // connection the server built.
  const given = await factory();
  own(given, { role: 'fresh' });
  return connectedOrClosed(given, logger);
}

/**
 * Whether `openFreshConnection` has a fresh connection to open for
 * `connection` — the factory's record or the host's `freshConnection` — so a
 * caller can refuse before it sends anything else. Nothing is opened.
 */
export function freshConnectionAvailable(connection: IAbapConnection): boolean {
  return (
    siblingRecordOf(connection) !== undefined || hostFactories.has(connection)
  );
}

/**
 * A fresh connection the server now holds, connected (RFC needs an explicit
 * `connect()`; `createAbapConnection` does not connect). If the connect
 * fails, the connection is closed and the failure is the answer: nothing
 * half-opened is left behind, on either path.
 */
async function connectedOrClosed(
  fresh: IAbapConnection,
  logger: Logger,
): Promise<IAbapConnection> {
  const connectable = fresh as { connect?: () => Promise<void> };
  try {
    if (typeof connectable.connect === 'function') await connectable.connect();
  } catch (error) {
    await closeQuietly(fresh, logger, 'A fresh connection');
    throw error;
  }
  return fresh;
}

/**
 * Closes a connection this process holds as its own — its one
 * `disconnect()`, joined if another end already asked for it (D55); a failure
 * to close is only logged, in fixed words (D22).
 */
export async function closeQuietly(
  opened: IAbapConnection,
  logger: Logger,
  what: string,
): Promise<void> {
  await endConnection(opened, () => {
    logger?.warn(`${what}: could not close its own connection`);
  });
}

/**
 * Runs `work` on a fresh connection over RFC, on the caller's otherwise, and
 * closes the fresh one whatever `work` does.
 */
export async function inOwnSessionOverRfc<T>(
  connection: IAbapConnection,
  logger: Logger,
  what: string,
  work: (connection: IAbapConnection) => Promise<T>,
): Promise<T> {
  if (!isRfcConnection(connection)) return work(connection);
  const fresh = await openFreshConnection(connection, logger);
  logger?.info(`${what}: over RFC, in an ABAP session of its own`);
  try {
    return await work(fresh);
  } finally {
    await closeQuietly(fresh, logger, what);
  }
}

/** Sessions holding a package lock, by lock handle. */
const lockSessions = new Map<string, IAbapConnection>();

/**
 * A fresh connection to lock a package on, on either transport. `keep`
 * registers it under the handle the lock returned; `drop` closes it when the
 * lock was not taken.
 */
export async function connectionForPackageLock(
  connection: IAbapConnection,
  logger: Logger,
): Promise<{
  connection: IAbapConnection;
  keep: (lockHandle: string) => void;
  drop: () => Promise<void>;
}> {
  // HTTP: the connection keeps the lock's stateful context to the stateful
  // requests alone (`sap-contextid` only with `x-sap-adt-sessiontype:
  // stateful`), so the PUT runs outside it, as Eclipse's does, and the caller's
  // connection serves. RFC has no stateless request, so there it is a session
  // of its own.
  if (!isRfcConnection(connection)) {
    return { connection, keep: () => {}, drop: async () => {} };
  }
  const fresh = await openFreshConnection(connection, logger);
  logger?.info('LockPackage: over RFC, in an ABAP session of its own');
  return {
    connection: fresh,
    keep: (lockHandle) => {
      lockSessions.set(lockHandle, fresh);
      // Held under its handle until the unlock — or the instance's terminal
      // close, which logs it off and forgets it here (§6.4).
      own(fresh, { role: 'lock' });
      whenEnded(fresh, () => {
        if (lockSessions.get(lockHandle) === fresh) {
          lockSessions.delete(lockHandle);
        }
      });
    },
    drop: () => closeQuietly(fresh, logger, 'LockPackage'),
  };
}

/** The session holding this lock, or the caller's connection if none does. */
export function connectionHoldingPackageLock(
  connection: IAbapConnection,
  lockHandle: string,
): IAbapConnection {
  return lockSessions.get(lockHandle) ?? connection;
}

/**
 * Forgets the session holding this lock and closes it. Called after the
 * unlock whatever it answered: a closed session releases its enqueue too.
 */
export async function releasePackageLockSession(
  lockHandle: string,
  logger: Logger,
): Promise<void> {
  const held = lockSessions.get(lockHandle);
  if (!held) return;
  lockSessions.delete(lockHandle);
  await closeQuietly(held, logger, 'UnlockPackage');
}
