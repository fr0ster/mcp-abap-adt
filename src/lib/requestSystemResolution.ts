/**
 * Fills the responsible person and master system of a request from the ABAP
 * Cloud system its connection points at.
 *
 * An embedding host that serves several SAP users from one process scopes the
 * responsible person and master system per request (`runWithRequestContext`).
 * On-premise they come from the caller's request or the configuration, and
 * nothing is sent. For an ABAP Cloud system the host often does not know them,
 * and the process-wide context holds one user for the whole process. So a
 * cloud request that does not carry them gets them here, from the system,
 * inside the library — no host has to repeat the lookup or import adt-clients
 * itself.
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
import { systemKindOf } from './connectionFactory';
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
 * Default resolver. The master system is determined from configuration, or by
 * a request in the cloud — there is no other way. On-premise it sends nothing
 * and answers `null` (configuration, the request scope or the tool arguments
 * supply the values); on ABAP Cloud it asks the system's own
 * `systeminformation` — the user name as responsible, the system id as master
 * system — or answers `null` when the system gives none. Which of the two is
 * the kind the connection was built for (`systemKindOf`), never a guess from
 * its URL.
 */
export const defaultSystemContextResolver: SystemContextResolver = async (
  connection,
) => {
  if (systemKindOf(connection) !== 'cloud') return null;
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
