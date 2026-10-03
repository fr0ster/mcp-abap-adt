/**
 * Fills the responsible person and master system of a request from the ABAP
 * Cloud system its connection points at.
 *
 * An embedding host that serves several SAP users from one process scopes the
 * responsible person and master system per request (`runWithRequestContext`).
 * On-premise they come from the caller's request, the configuration or the
 * login, and nothing is sent to find them. For an ABAP Cloud system the host often does not know them,
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
import { AsyncLocalStorage } from 'node:async_hooks';
import { getSystemInformation } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { errorClassOf } from './auth/errors';
import { systemKindOf } from './connectionFactory';
import { logger } from './logger';
import { getRequestContext, runWithRequestContext } from './requestContext';
import {
  getEffectiveSystemContext,
  getStatedSystemContext,
} from './systemContext';

/**
 * Resolved values; `null` when the connection is not asked (on-premise — the
 * login then stands as the responsible). A cloud system that answers nothing
 * is `{}`: on a cloud connection the login never stands in for its user.
 */
export type ResolvedSystemContext = {
  responsible?: string;
  masterSystem?: string;
} | null;

/** Looks up the responsible person and master system for a connection. */
export type SystemContextResolver = (
  connection: IAbapConnection,
) => Promise<ResolvedSystemContext>;

/**
 * Default resolver. On-premise it sends nothing and answers `null`
 * (configuration, the request scope, the tool arguments or the login supply
 * the values); on ABAP Cloud it asks the system's own `systeminformation` —
 * the user name as responsible, the system id as master system — or answers
 * `{}` when the system gives none. Which of the two is
 * the kind the connection was built for (`systemKindOf`), never a guess from
 * its URL.
 */
/**
 * One resolver per stated kind, for the process: `resolveOnce` memoises per
 * resolver, so a host that builds a server per request still makes one
 * lookup per connection.
 */
const resolversByKind = new Map<string | undefined, SystemContextResolver>();

/**
 * The default resolver for a server that states its system kind
 * (`systemType`): for a connection the factory did not build, that kind wins
 * over `SAP_SYSTEM_TYPE`. A connection the factory built follows its
 * recorded settings either way. The same kind answers the same resolver.
 */
export function systemContextResolverFor(
  systemType: string | undefined,
): SystemContextResolver {
  const known = resolversByKind.get(systemType);
  if (known) return known;
  const resolver: SystemContextResolver = async (connection) => {
    if (systemKindOf(connection, process.env, systemType) !== 'cloud') {
      return null;
    }
    const info = await getSystemInformation(connection);
    if (!info) return {};
    return { responsible: info.userName, masterSystem: info.systemID };
  };
  resolversByKind.set(systemType, resolver);
  return resolver;
}

export const defaultSystemContextResolver: SystemContextResolver =
  systemContextResolverFor(undefined);

/**
 * Set around a call whose cloud lookup threw: the guard then refuses a
 * missing responsible as a failure to retry, not as a key to set.
 */
const lookupFailed = new AsyncLocalStorage<true>();

/** Whether this call's cloud lookup threw (see `withResolvedSystemContext`). */
export function systemLookupFailed(): boolean {
  return lookupFailed.getStore() === true;
}

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
 * Run `fn` with the responsible person, login and master system a
 * destination's own `.env` states. `SAP_RESPONSIBLE` and `SAP_MASTER_SYSTEM`
 * enter for the keys the request scope does not carry: the request's headers
 * win over the destination, and the destination over the process
 * configuration (which a key left absent falls back to). The destination's
 * `SAP_USERNAME` (or an `x-sap-*` basic connection's `x-sap-login`) enters as
 * the login.
 * Per call, in the request scope — never the process cache — so concurrent
 * requests to different destinations cannot see each other's values.
 */
export function withDestinationSystemContext<T>(
  stated:
    | { responsible?: string; login?: string; masterSystem?: string }
    | undefined,
  fn: () => T,
): T {
  const scope = getRequestContext();
  const added: { responsible?: string; login?: string; masterSystem?: string } =
    {};
  if (stated?.responsible && !(scope && 'responsible' in scope)) {
    added.responsible = stated.responsible;
  }
  if (stated?.masterSystem && !(scope && 'masterSystem' in scope)) {
    added.masterSystem = stated.masterSystem;
  }
  if (stated?.login) added.login = stated.login;
  if (!added.responsible && !added.masterSystem && !added.login) return fn();
  return runWithRequestContext(
    {
      ...scope,
      ...added,
      // Entering a scope must not change the language the call sees: inside
      // a scope it is the scope's, outside one the process's.
      masterLanguage: getEffectiveSystemContext().masterLanguage,
    },
    fn,
  );
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

  // What is stated, without the login: on a cloud connection the login is
  // the system's user (Ruling 18), so the process SAP_USERNAME, a
  // destination's SAP_USERNAME and x-sap-login do not count there.
  const stated = getStatedSystemContext();
  const effective = getEffectiveSystemContext();
  // By value (Ruling 17): an empty value is missing, whether the scope
  // carries its key or not. A host that always enters a scope with both keys
  // — values possibly undefined — still gets the cloud system's answer. Key
  // presence keeps deciding in getStatedSystemContext, against the process
  // cache: that is what stops one user's value reaching another's.
  if (stated.responsible && stated.masterSystem) return fn();

  let resolved: ResolvedSystemContext;
  let failed = false;
  try {
    resolved = await resolveOnce(resolver, connection);
  } catch (error) {
    failed = true;
    // The class only: a lookup's message may quote what the system answered (H4).
    logger.warn(
      `Could not resolve responsible/master system from the connection: ${errorClassOf(error)}`,
    );
    // Only a cloud connection is asked: a login does not stand in for the
    // system's user, so the call runs with what is stated.
    resolved = {};
  }
  // Not a cloud connection: nothing asked, the login applies as it is.
  if (!resolved) return fn();

  const scoped = () =>
    runWithRequestContext(
      {
        ...getRequestContext(),
        login: undefined,
        responsible: stated.responsible || resolved.responsible,
        masterSystem: stated.masterSystem || resolved.masterSystem,
        // The effective value, not the scope's: inside a scope it IS the
        // scope's value, so an outer scope's language is kept; outside any
        // scope it is the process language, which entering this new scope
        // would otherwise drop, since a scope's masterLanguage never falls
        // back to the process.
        masterLanguage: effective.masterLanguage,
      },
      fn,
    );
  return failed ? lookupFailed.run(true, scoped) : scoped();
}
