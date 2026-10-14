/**
 * Fills the responsible person and master system of a request from the ABAP
 * system its connection points at.
 *
 * The responsible person is the user the system names in its
 * `systeminformation`, and the master system its system id — on ABAP Cloud
 * and on-premise alike: with passwordless logon or a provisioned user, the
 * user exists only inside the system. What is configured (the request's
 * headers, a destination's `.env`, the process configuration, the login) is
 * used only when the function is unavailable on an on-premise system (a
 * `404`); on ABAP Cloud a `404` is a failed lookup like any other. The
 * lookup is made here, inside the library — no host has to repeat it or
 * import adt-clients itself.
 *
 * Resolution is keyed by the connection object: one connection belongs to one
 * user on one system, so its answer is the same for every request on it and
 * cannot reach another user's connection. The map is weak, so a connection
 * that goes away takes its entry with it.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { errorClassOf } from './auth/errors';
import { systemKindOf } from './connectionFactory';
import { logger } from './logger';
import { getRequestContext, runWithRequestContext } from './requestContext';
import { getEffectiveSystemContext } from './systemContext';
import {
  isSystemInformationUnavailable,
  readSystemInformation,
} from './systemInformation';

/**
 * Resolved values; `null` when the system has no `systeminformation`
 * function (an on-premise `404`) — the configured values then stand as they
 * are. An answer without a user has no `responsible`: the system's answer
 * wins, so nothing configured stands in for it.
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
 * Default resolver: asks the system's own `systeminformation`
 * (`readSystemInformation`) on every kind of system — the user name as
 * responsible, the system id as master system, neither when the answer
 * carries none. A `404` on an on-premise system is the function unavailable:
 * `null`, and the configured values apply. Any other status but a `2xx`, and
 * on ABAP Cloud a `404` too, is a failed lookup, thrown as it came. Which
 * kind is the kind the connection was built for (`systemKindOf`), never a
 * guess from its URL or from the answer.
 */
/**
 * One resolver per stated kind, for the process: `resolveOnce` memoises per
 * resolver, so a host that builds a server per request still makes one
 * lookup per connection.
 */
const resolversByKind = new Map<string | undefined, SystemContextResolver>();

/** The shipped resolvers: their `responsible` is the session's user. */
const shippedResolvers = new WeakSet<SystemContextResolver>();

/**
 * Whether `resolver` is a shipped one (`systemContextResolverFor`), whose
 * answer names the session's user as `systeminformation` does — so a known
 * answer serves for the user too, with no second request.
 */
export function isShippedResolver(
  resolver: SystemContextResolver | null,
): boolean {
  return resolver !== null && shippedResolvers.has(resolver);
}

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
    let info: Awaited<ReturnType<typeof readSystemInformation>>;
    try {
      info = await readSystemInformation(connection);
    } catch (error) {
      // On-premise without the function: the configuration applies. On
      // ABAP Cloud the system information is required: any failure is a
      // failed lookup, never an answer without a user.
      if (
        isSystemInformationUnavailable(error) &&
        systemKindOf(connection, process.env, systemType) !== 'cloud'
      ) {
        return null;
      }
      throw error;
    }
    return { responsible: info.user, masterSystem: info.systemId };
  };
  resolversByKind.set(systemType, resolver);
  shippedResolvers.add(resolver);
  return resolver;
}

export const defaultSystemContextResolver: SystemContextResolver =
  systemContextResolverFor(undefined);

/**
 * A system that answered its lookup but named no user — a
 * `systeminformation` whose user is missing, empty, blank or not a string,
 * a body that is no JSON or JSON that is no object: not a valid ABAP system
 * for this server.
 */
export class SystemWithoutUserError extends Error {
  constructor() {
    super('the system answered systeminformation without a user');
    this.name = 'SystemWithoutUserError';
  }
}

const requiringUserOf = new WeakMap<
  SystemContextResolver,
  SystemContextResolver
>();

/**
 * `resolver`, refusing an answer that names no user (`SystemWithoutUserError`):
 * `null` (the function unavailable on-premise) passes; any other answer must carry a
 * responsible that is a non-blank string. One wrapper per resolver, so
 * `resolveOnce` still makes one lookup per connection — and a refused one is
 * not kept, so the next caller asks again.
 */
export function requiringUser(
  resolver: SystemContextResolver,
): SystemContextResolver {
  const known = requiringUserOf.get(resolver);
  if (known) return known;
  const checked: SystemContextResolver = async (connection) => {
    const system = await resolver(connection);
    if (system === null) return null;
    const user: unknown = system.responsible;
    if (typeof user !== 'string' || user.trim() === '') {
      throw new SystemWithoutUserError();
    }
    return system;
  };
  requiringUserOf.set(resolver, checked);
  return checked;
}

/**
 * Set around a call whose lookup threw: the guard then refuses a missing
 * responsible as a failure to retry, not as a key to set.
 */
const lookupFailed = new AsyncLocalStorage<true>();

/**
 * Set around a call whose system context was already applied (by the
 * server, before its tool): a handler wrapped again (`HandlerExporter`)
 * neither asks a second time nor replaces it.
 */
const applied = new AsyncLocalStorage<true>();

/** Whether this call's lookup threw (see `withResolvedSystemContext`). */
export function systemLookupFailed(): boolean {
  return lookupFailed.getStore() === true;
}

const memo = new WeakMap<
  SystemContextResolver,
  WeakMap<object, Promise<ResolvedSystemContext>>
>();

/**
 * One resolution per resolver and connection. Concurrent callers share the
 * in-flight promise; a `null` answer is kept (the function stays
 * unavailable); a
 * rejected lookup is dropped so the next request tries again.
 */
export function resolveOnce(
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
    | {
        responsible?: string;
        login?: string;
        masterSystem?: string;
        debugTerminalId?: string;
        debugIdeId?: string;
        debugBreakpointConflict?: string;
      }
    | undefined,
  fn: () => T,
): T {
  const scope = getRequestContext();
  const added: {
    responsible?: string;
    login?: string;
    masterSystem?: string;
    debugTerminalId?: string;
    debugIdeId?: string;
    debugBreakpointConflict?: string;
  } = {};
  if (stated?.responsible && !(scope && 'responsible' in scope)) {
    added.responsible = stated.responsible;
  }
  if (stated?.masterSystem && !(scope && 'masterSystem' in scope)) {
    added.masterSystem = stated.masterSystem;
  }
  if (stated?.debugTerminalId && !(scope && 'debugTerminalId' in scope)) {
    added.debugTerminalId = stated.debugTerminalId;
  }
  if (stated?.debugIdeId && !(scope && 'debugIdeId' in scope)) {
    added.debugIdeId = stated.debugIdeId;
  }
  if (
    stated?.debugBreakpointConflict &&
    !(scope && 'debugBreakpointConflict' in scope)
  ) {
    added.debugBreakpointConflict = stated.debugBreakpointConflict;
  }
  if (stated?.login) added.login = stated.login;
  if (Object.keys(added).length === 0) return fn();
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
 * Run `fn` with the responsible person and master system the connection's
 * system names (`ResolvedSystemContext`). `fn` runs unchanged when there is
 * no resolver, no connection, the context was already applied around this
 * call, or the system has no `systeminformation` function on-premise (the
 * configured values apply). A lookup that fails never makes the call fail:
 * `fn` runs with no responsible and no master system — nothing configured
 * stands in — and a change it attempts is refused as a lookup to retry.
 */
export async function withResolvedSystemContext<T>(
  connection: IAbapConnection | null | undefined,
  fn: () => Promise<T> | T,
  resolver: SystemContextResolver | null = defaultSystemContextResolver,
): Promise<T> {
  if (!resolver || !connection || applied.getStore() === true) return fn();

  const effective = getEffectiveSystemContext();
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
    resolved = {};
  }
  return applyResolved(resolved, failed, effective, fn);
}

/**
 * Run `fn` with the responsible person and master system the request lacks
 * filled from a resolution already made — the server's, before the tool
 * runs (spec §5.7: no send outside the connection's main flow). Sends nothing.
 * `undefined`: nothing was resolved (no resolver), and `fn` runs as it is.
 */
export async function withKnownSystemContext<T>(
  resolved: ResolvedSystemContext | undefined,
  fn: () => Promise<T> | T,
): Promise<T> {
  if (resolved === undefined) return fn();
  return applyResolved(resolved, false, getEffectiveSystemContext(), fn);
}

function applyResolved<T>(
  resolved: ResolvedSystemContext,
  failed: boolean,
  effective: ReturnType<typeof getEffectiveSystemContext>,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  // No systeminformation on-premise: the configured values apply as they are.
  if (!resolved) return applied.run(true, fn);

  // The system's answer wins over everything configured: the stated
  // responsible and master system, and the login that would stand in.
  const scoped = () =>
    runWithRequestContext(
      {
        ...getRequestContext(),
        login: undefined,
        responsible: resolved.responsible,
        masterSystem: resolved.masterSystem,
        // The effective value, not the scope's: inside a scope it IS the
        // scope's value, so an outer scope's language is kept; outside any
        // scope it is the process language, which entering this new scope
        // would otherwise drop, since a scope's masterLanguage never falls
        // back to the process.
        masterLanguage: effective.masterLanguage,
      },
      () => applied.run(true, fn),
    );
  return failed ? lookupFailed.run(true, scoped) : scoped();
}
