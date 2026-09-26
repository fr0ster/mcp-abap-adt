/**
 * Fills the responsible person and master system of a request from the ABAP
 * Cloud system its connection points at.
 *
 * An embedding host that serves several SAP users from one process scopes the
 * responsible person and master system per request (`runWithRequestContext`).
 * On-premise it knows them from the caller's request. For an ABAP Cloud system
 * it often does not, and the process-wide cache that `resolveSystemContext`
 * fills at server init holds one user for the whole process. So a request that
 * does not carry them gets them here, from the system, inside the library —
 * no host has to repeat the lookup or import adt-clients itself.
 *
 * Resolution is keyed by the connection object: one connection belongs to one
 * user on one system, so its answer is the same for every request on it and
 * cannot reach another user's connection. The map is weak, so a connection
 * that goes away takes its entry with it.
 *
 * It only fills what the request did not carry: a value from the request scope
 * or from the process context always wins.
 */
import { getSystemInformation } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { logger } from './logger';
import { getRequestContext, runWithRequestContext } from './requestContext';
import { getEffectiveSystemContext } from './systemContext';

/** Resolved values, or `null` when the system has none to give (on-premise). */
export type ResolvedSystemContext = {
  responsible?: string;
  masterSystem?: string;
} | null;

/** Looks up the responsible person and master system for a connection. */
export type SystemContextResolver = (
  connection: IAbapConnection,
) => Promise<ResolvedSystemContext>;

/**
 * Whether the connection points at an ABAP Cloud system.
 *
 * The same rule as adt-clients' `isCloudEnvironment`, which the package does
 * not export from any entry point: a `*.hana.ondemand.com` URL is cloud; plain
 * `http` with an explicit port is on-premise; anything else is decided by
 * whether the system answers `systeminformation`. Kept here so that last case
 * reuses the one lookup instead of making it twice.
 */
async function urlVerdict(
  connection: IAbapConnection,
): Promise<boolean | undefined> {
  try {
    const baseUrl = await connection.getBaseUrl();
    if (!baseUrl) return undefined;
    if (/\.hana\.ondemand\.com/i.test(baseUrl)) return true;
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol === 'http:' && parsed.port) return false;
    } catch {
      // Not a parsable URL: let the system decide.
    }
  } catch {
    // No base URL: let the system decide.
  }
  return undefined;
}

/**
 * Default resolver: `null` on-premise; on ABAP Cloud the system's own
 * `systeminformation` — the user name as responsible, the system id as master
 * system — or `null` when the system gives none.
 */
export const defaultSystemContextResolver: SystemContextResolver = async (
  connection,
) => {
  if ((await urlVerdict(connection)) === false) return null;
  const info = await getSystemInformation(connection);
  if (!info) return null;
  return { responsible: info.userName, masterSystem: info.systemID };
};

const memo = new WeakMap<
  SystemContextResolver,
  WeakMap<object, Promise<ResolvedSystemContext>>
>();

/**
 * One resolution per resolver and connection. Concurrent callers share the
 * in-flight promise; a `null` answer is kept (on-premise stays on-premise); a
 * rejected lookup is dropped so the next request tries again.
 */
function resolveOnce(
  resolver: SystemContextResolver,
  connection: IAbapConnection,
): Promise<ResolvedSystemContext> {
  let perConnection = memo.get(resolver);
  if (!perConnection) {
    perConnection = new WeakMap();
    memo.set(resolver, perConnection);
  }
  const known = perConnection.get(connection);
  if (known) return known;

  // async wrapper: an injected resolver that throws synchronously rejects too.
  const pending = (async () => resolver(connection))();
  perConnection.set(connection, pending);
  pending.catch(() => {
    if (perConnection.get(connection) === pending) {
      perConnection.delete(connection);
    }
  });
  return pending;
}

/**
 * Run `fn` with the responsible person and master system the request lacks
 * filled from the connection's system. `fn` runs unchanged when there is no
 * resolver, no connection, nothing missing, nothing to fill, or the lookup
 * fails — resolution never makes a call fail.
 */
export async function withResolvedSystemContext<T>(
  connection: IAbapConnection | null | undefined,
  fn: () => Promise<T> | T,
  resolver: SystemContextResolver | null = defaultSystemContextResolver,
): Promise<T> {
  if (!resolver || !connection) return fn();

  const effective = getEffectiveSystemContext();
  // Key presence, not truthiness — the same rule 10.1.0 established and
  // documents: a scope that carries the key, even as `undefined`, has said
  // "this request has no responsible", and that answer wins over every other
  // source. Deciding by truthiness instead would fill exactly the case a host
  // deliberately emptied, and would make `CLIENT_CONFIGURATION.md`'s
  // "present (even `undefined`) → the scope's value" row false on cloud.
  const scope = getRequestContext();
  const wantsResponsible =
    !effective.responsible && !(scope && 'responsible' in scope);
  const wantsMasterSystem =
    !effective.masterSystem && !(scope && 'masterSystem' in scope);
  if (!wantsResponsible && !wantsMasterSystem) return fn();

  let resolved: ResolvedSystemContext;
  try {
    resolved = await resolveOnce(resolver, connection);
  } catch (error) {
    logger.warn(
      `Could not resolve responsible/master system from the connection: ${error instanceof Error ? error.message : String(error)}`,
    );
    return fn();
  }
  if (!resolved) return fn();

  return runWithRequestContext(
    {
      ...getRequestContext(),
      responsible: wantsResponsible
        ? resolved.responsible
        : effective.responsible,
      masterSystem: wantsMasterSystem
        ? resolved.masterSystem
        : effective.masterSystem,
      // The effective value, not the scope's: inside a scope it IS the scope's
      // value, so an outer scope's language is kept; outside any scope it is
      // the process language, which entering this new scope would otherwise
      // drop, since a scope's masterLanguage never falls back to the process.
      masterLanguage: effective.masterLanguage,
    },
    fn,
  );
}
