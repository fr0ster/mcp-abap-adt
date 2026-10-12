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
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { ServerRefusal } from './auth/serverRefusal';
import { createAbapConnection, siblingRecordOf } from './connectionFactory';
import { isRfcConnection } from './connectionKind';
import type { HandlerContext } from './handlers/interfaces';
import { currentRequestSignal } from './requestSignal';

type Logger = HandlerContext['logger'];

/**
 * The host's factory of fresh connections (spec §4.3, D20): a connection of
 * its own, built by the host with its credential, honouring `signal`. Once
 * returned it is the server's (D22): held for the operation or under a
 * package lock's handle, then closed with `disconnect()`.
 */
export type FreshConnectionFactory = (options: {
  signal?: AbortSignal;
}) => Promise<IAbapConnection>;

/** Injected connections whose host gave a fresh-connection factory. */
const hostFactories = new WeakMap<object, FreshConnectionFactory>();

/**
 * Records the factory the host gave beside the connection it injected
 * (`EmbeddableMcpServer`'s `freshConnection`). A connection set without one
 * is not recorded, and a fresh connection on it is refused.
 */
export function registerFreshConnectionFactory(
  connection: object,
  factory: FreshConnectionFactory,
): void {
  hostFactories.set(connection, factory);
}

/**
 * A connection of its own, ready for requests, decided from a registry keyed
 * by the connection object — never from the connection's configuration
 * (spec §4.3, D20):
 *
 * - built by the server (`createAbapConnection`) → the factory's record: the
 *   same settings and the same credential object, connected here;
 * - injected with the host's `freshConnection` → that factory, called with
 *   the current request's signal;
 * - anything else → refused `fresh_connection_unavailable`, nothing sent.
 */
export async function openFreshConnection(
  connection: IAbapConnection,
  logger: Logger,
): Promise<IAbapConnection> {
  const record = siblingRecordOf(connection);
  if (record) {
    const fresh = createAbapConnection(
      record.settings,
      record.credential,
      logger ?? null,
    ) as IAbapConnection & { connect?: () => Promise<void> };
    // RFC connections need an explicit connect(); createAbapConnection does not.
    if (typeof fresh.connect === 'function') await fresh.connect();
    return fresh;
  }
  const factory = hostFactories.get(connection);
  if (factory) return factory({ signal: currentRequestSignal() });
  throw new ServerRefusal('fresh_connection_unavailable');
}

/**
 * Closes a connection this process holds as its own; a failure to close is
 * only logged, in fixed words (D22).
 */
export async function closeQuietly(
  opened: IAbapConnection,
  logger: Logger,
  what: string,
): Promise<void> {
  const closable = opened as { disconnect?: () => Promise<void> };
  try {
    if (typeof closable.disconnect !== 'function') return;
    await closable.disconnect();
  } catch {
    logger?.warn(`${what}: could not close its own connection`);
  }
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
