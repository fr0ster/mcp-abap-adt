/**
 * Fills the responsible person and master system of a request from the ABAP
 * system its connection points at.
 *
 * The responsible person is the user the system names in its
 * `systeminformation`, and the master system its system id. When the system
 * answers with them, they are taken from there. When it has no
 * `systeminformation`, answers without the user, or answers an error: on
 * ABAP Cloud (which always has it) that is the call's error; on-premise the
 * configured values (the request's headers on HTTP/SSE, the start
 * configuration on stdio) are taken, and the call's error only when they
 * state no user either. The lookup is made here, inside the library — no
 * host has to repeat it or import adt-clients itself.
 *
 * Resolution is keyed by the connection object: one connection belongs to one
 * user on one system, so its answer is the same for every request on it and
 * cannot reach another user's connection. The map is weak, so a connection
 * that goes away takes its entry with it.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { errorClassOf } from './auth/errors';
import { failureOf, readGuarded } from './auth/failures';
import { ServerRefusal } from './auth/serverRefusal';
import { siblingRecordOf, systemKindOf } from './connectionFactory';
import { logger } from './logger';
import { getRequestContext, runWithRequestContext } from './requestContext';
import { getEffectiveSystemContext } from './systemContext';
import {
  isSystemInformationUnavailable,
  readSystemInformation,
} from './systemInformation';

/**
 * Resolved values; `null` when the system gave no information (an
 * on-premise system without `systeminformation`, one that answered without
 * the user or answered an error) — the configured values then stand as they
 * are.
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
 * An ABAP Cloud destination whose system has no `systeminformation`
 * endpoint (a `404`): every ABAP Cloud system has it, so the configuration
 * or the headers are inconsistent. The call's
 * `cloud_without_systeminformation`.
 */
export class CloudWithoutSystemInformationError extends Error {
  constructor() {
    super('the ABAP Cloud destination has no systeminformation endpoint');
    this.name = 'CloudWithoutSystemInformationError';
  }
}

/**
 * An ABAP Cloud system that has the endpoint but gave no information — an
 * answer without the user, another error status, a failure: a problem of
 * the ABAP system with a valid configuration. The call's
 * `system_lookup_failed`.
 */
export class NoSystemInformationError extends Error {
  constructor() {
    super('the ABAP Cloud system gave no systeminformation');
    this.name = 'NoSystemInformationError';
  }
}

/**
 * The default resolver for a server that states its system kind
 * (`systemType`): for a connection the factory did not build, that kind wins
 * over `SAP_SYSTEM_TYPE`. A connection the factory built follows its
 * recorded settings either way. The same kind answers the same resolver.
 *
 * It asks the system's own `systeminformation` (`readSystemInformation`):
 * an answer naming the user is the user as responsible and the system id as
 * master system. Anything else — a `404`, an answer without the user, an
 * error — is no information: on ABAP Cloud a `404` is
 * `CloudWithoutSystemInformationError` (the configuration or headers are
 * inconsistent) and any other `NoSystemInformationError` (the system's
 * problem); on-premise `null` (the configured values apply). A chain
 * failure is thrown as it came. The kind is the one the connection was built for
 * (`systemKindOf`), never a guess from its URL or from the answer.
 */
export function systemContextResolverFor(
  systemType: string | undefined,
): SystemContextResolver {
  const known = resolversByKind.get(systemType);
  if (known) return known;
  const resolver: SystemContextResolver = async (connection) => {
    let user: string | undefined;
    let systemId: string | undefined;
    let absent = false;
    try {
      ({ user, systemId } = await readSystemInformation(connection));
    } catch (error) {
      if (readGuarded(failureOf, error) !== undefined) throw error;
      absent = isSystemInformationUnavailable(error);
    }
    if (typeof user === 'string' && user.trim() !== '') {
      return { responsible: user, masterSystem: systemId };
    }
    if (systemKindOf(connection, process.env, systemType) === 'cloud') {
      throw absent
        ? new CloudWithoutSystemInformationError()
        : new NoSystemInformationError();
    }
    return null;
  };
  resolversByKind.set(systemType, resolver);
  shippedResolvers.add(resolver);
  return resolver;
}

export const defaultSystemContextResolver: SystemContextResolver =
  systemContextResolverFor(undefined);

/**
 * An on-premise system that gave no information whose call states no user
 * either — neither the connection's parameters (`SAP_USERNAME`) nor the
 * request's headers (`x-sap-login`): who the session is cannot be known.
 */
export class SystemUserUnknownError extends Error {
  constructor() {
    super('the system gave no systeminformation and no user is stated');
    this.name = 'SystemUserUnknownError';
  }
}

/**
 * What a failed lookup is to the call that needed it — the same on every
 * path that asks before a handler runs (the server's, `HandlerExporter`'s):
 * an ABAP Cloud system without the endpoint
 * `cloud_without_systeminformation`, an on-premise system with no
 * information and no user stated `system_user_unknown`, a chain failure as
 * it is, any other the server's `system_lookup_failed`. `warn` gets fixed words, or the error's class
 * only: a lookup's message may quote what the system answered (H4).
 */
export function systemLookupRefusal(
  error: unknown,
  warn: ((message: string) => void) | undefined,
): unknown {
  if (error instanceof CloudWithoutSystemInformationError) {
    warn?.(
      'The ABAP Cloud destination has no systeminformation endpoint: the configuration or the headers are inconsistent',
    );
    return new ServerRefusal('cloud_without_systeminformation');
  }
  if (error instanceof SystemUserUnknownError) {
    warn?.(
      'The system gave no systeminformation and the call states no user: the session user is unknown',
    );
    return new ServerRefusal('system_user_unknown');
  }
  if (readGuarded(failureOf, error) !== undefined) return error;
  warn?.(
    `Could not resolve responsible/master system from the connection: ${errorClassOf(error)}`,
  );
  return new ServerRefusal('system_lookup_failed');
}

/**
 * Set around a call whose system context was already applied (by the
 * server, before its tool): a handler wrapped again (`HandlerExporter`)
 * neither asks a second time nor replaces it.
 */
const applied = new AsyncLocalStorage<true>();

const memo = new WeakMap<
  SystemContextResolver,
  WeakMap<object, Promise<ResolvedSystemContext>>
>();

/**
 * One resolution per resolver and connection. Concurrent callers share the
 * in-flight promise; an answer naming the user is kept; no information
 * (`null`, an answer without a user — read as `null`) and a rejected lookup
 * are dropped, so the next request asks again.
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
  const pending = (async () => withUser(await resolver(connection)))();
  perConnection.set(connection, pending);
  const drop = () => {
    if (perConnection.get(connection) === pending) {
      perConnection.delete(connection);
    }
  };
  pending.then((system) => {
    if (system === null) drop();
  }, drop);
  return pending;
}

/** An answer that names no user (a non-blank string) is no information. */
function withUser(system: ResolvedSystemContext): ResolvedSystemContext {
  if (system === null) return null;
  const user: unknown = system.responsible;
  return typeof user === 'string' && user.trim() !== '' ? system : null;
}

/**
 * The user a call on `connection` states: the connection's parameters
 * (`SAP_USERNAME`, the factory's record of how it was built), else the
 * login the request's headers carry (`x-sap-login`, `stated`); `undefined`
 * when neither names one (absent or blank).
 */
export function statedUserOf(
  connection: object,
  stated: string | undefined,
): string | undefined {
  const user = siblingRecordOf(connection)?.settings.username ?? stated ?? '';
  return user.trim() === '' ? undefined : user;
}

/**
 * `connection`'s system information for a call about to run on it — the
 * rule every path that asks before a handler applies (the server's,
 * `HandlerExporter`'s, the stdio start's): one lookup per connection
 * (`resolveOnce`); no information (`null`) admits the call only when it
 * states a user (`statedUser`, see `statedUserOf`) — else
 * `SystemUserUnknownError`.
 */
export async function resolveForCall(
  resolver: SystemContextResolver,
  connection: IAbapConnection,
  statedUser: string | undefined,
): Promise<ResolvedSystemContext> {
  const system = await resolveOnce(resolver, connection);
  if (system === null && (statedUser ?? '').trim() === '') {
    throw new SystemUserUnknownError();
  }
  return system;
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
 * no resolver, no connection, or the context was already applied around this
 * call; with the configured values when the system gave no information
 * on-premise — when the call states a user (the connection's
 * `SAP_USERNAME`, else the request scope's login). A lookup that fails (on
 * ABAP Cloud, any answer without the information), or no information
 * on-premise with no user stated (`system_user_unknown`), is the call's
 * error (`systemLookupRefusal`): `fn` does not run, and nothing
 * failed is kept — the next call asks again.
 */
export async function withResolvedSystemContext<T>(
  connection: IAbapConnection | null | undefined,
  fn: () => Promise<T> | T,
  resolver: SystemContextResolver | null = defaultSystemContextResolver,
): Promise<T> {
  if (!resolver || !connection || applied.getStore() === true) return fn();

  const effective = getEffectiveSystemContext();
  let resolved: ResolvedSystemContext;
  try {
    resolved = await resolveForCall(
      resolver,
      connection,
      statedUserOf(connection, getRequestContext()?.login),
    );
  } catch (error) {
    throw systemLookupRefusal(error, (message) => logger.warn(message));
  }
  return applyResolved(resolved, effective, fn);
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
  return applyResolved(resolved, getEffectiveSystemContext(), fn);
}

function applyResolved<T>(
  resolved: ResolvedSystemContext,
  effective: ReturnType<typeof getEffectiveSystemContext>,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  // No systeminformation on-premise: the configured values apply as they are.
  if (!resolved) return applied.run(true, fn);

  // The system's answer wins over everything configured: the stated
  // responsible and master system, and the login that would stand in.
  return runWithRequestContext(
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
}
