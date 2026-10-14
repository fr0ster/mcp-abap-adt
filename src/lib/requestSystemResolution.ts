/**
 * Fills the responsible person and master system of a call from the ABAP
 * system its connection points at — the mechanism; the rules that make the
 * connection's parameters from it are a host's (`SystemContextRules`:
 * `@mcp-abap-adt/responsible-rules`, which the transports pass).
 *
 * A resolver (the shipped one reads `systeminformation`) answers only what
 * the system said: the information (the user, the system id), no
 * information, or a credential failure, which is the call's as it came.
 * Asked only when a host gives one: without a resolver nothing is looked
 * up. The connection's parameters — the responsible and master system its
 * calls take — are made once from the lookup: by the rules when given
 * (`SystemContextRules.parametersFor`, which may refuse); without them the
 * information, or none (the configured values stand). Parameters the rules
 * made are kept, and the information; anything else is not, and the next
 * call asks again. The lookup is made here, inside the library — no host has
 * to repeat it or import adt-clients itself.
 *
 * Kept by the connection object: one connection belongs to one user on one
 * system. The map is weak, so a connection that goes away takes its entry
 * with it.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { failureOf, readGuarded } from './auth/failures';
import { siblingRecordOf, systemKindOf } from './connectionFactory';
import { logger } from './logger';
import { getRequestContext, runWithRequestContext } from './requestContext';
import { getStatedSystemContext } from './systemContext';
import {
  isCredentialRefusedStatus,
  isSystemInformationUnavailable,
  readSystemInformation,
} from './systemInformation';
import type { AbapSystemKind } from './systemKind';

/**
 * Resolved values; `null` when the system gave no information — the
 * configured values then stand as they are.
 */
export type ResolvedSystemContext = {
  responsible?: string;
  masterSystem?: string;
} | null;

/**
 * Looks up the responsible person and master system for a connection. It
 * answers only what the system said: an answer naming the user (a non-blank
 * `responsible`) is the information; `null`, or an answer naming no user, is
 * no information; a throw is a credential failure when it is one (a chain
 * failure, or a `401`), thrown as it came — else no information, a `404`
 * read as the endpoint absent. What follows is the host's rules', never the
 * resolver's.
 */
export type SystemContextResolver = (
  connection: IAbapConnection,
) => Promise<ResolvedSystemContext>;

/** System information as kept: an answer naming the user. */
type KnownSystemContext = Exclude<ResolvedSystemContext, null>;

/**
 * What a lookup answered: the information, or none — `absent` when the
 * system has no `systeminformation` endpoint (a `404`).
 */
export type SystemLookup =
  | { readonly system: KnownSystemContext }
  | { readonly system: null; readonly absent: boolean };

/** What a connection states when its parameters are made, for the rules. */
export interface SystemCall {
  /** The connection's kind: recorded by the factory, else stated; `undefined`: none. */
  readonly kind: AbapSystemKind | undefined;
  /** The responsible stated (headers, destination, process); `undefined`: none. */
  readonly responsible: string | undefined;
  /** The login stated (`SAP_USERNAME`, `x-sap-login`); `undefined`: none. */
  readonly login: string | undefined;
  /** The master system stated; `undefined`: none. */
  readonly masterSystem: string | undefined;
  /** Where the rules' fixed words go. */
  readonly warn: (message: string) => void;
}

/**
 * The rules that make a connection's parameters from its lookup — the
 * responsible and master system every call on it takes, which also name
 * the debugger's request user and a background run's caller. Asked once,
 * when the parameters are made; what they answer is kept. A throw is a
 * refusal: the call that made the connection fails, and nothing is kept. A
 * credential failure never reaches them: lib passes it through as it came.
 */
export interface SystemContextRules {
  parametersFor(lookup: SystemLookup, call: SystemCall): ResolvedSystemContext;
}

/**
 * The shipped resolver: the system's own `systeminformation`
 * (`readSystemInformation`). An answer naming the user is the user as
 * responsible and the system id as master system; an answer without the
 * user is `null`; a failed request is thrown as it came. The same on every
 * kind of system.
 */
export const defaultSystemContextResolver: SystemContextResolver = async (
  connection,
) => {
  const { user, systemId } = await readSystemInformation(connection);
  if (typeof user === 'string' && user.trim() !== '') {
    return { responsible: user, masterSystem: systemId };
  }
  return null;
};

/**
 * Whether `error` — what a lookup threw — is a credential failure: a chain
 * failure (the credentials refused, read by `failureOf`, the server's own
 * refusals among them), or a `401`. Not a `systeminformation` failure: any
 * call would get it, so it is the call's as it came, on every kind of
 * system.
 */
export function isCredentialFailure(error: unknown): boolean {
  return (
    readGuarded(failureOf, error) !== undefined ||
    isCredentialRefusedStatus(error)
  );
}

/**
 * Set around a call whose system context was already applied (by the
 * server, before its tool): a handler wrapped again (`HandlerExporter`)
 * neither asks a second time nor replaces it.
 */
const applied = new AsyncLocalStorage<true>();

/**
 * `resolver`'s answer on `connection`, read as `SystemLookup`; a credential
 * failure is thrown as it came.
 */
export async function lookUpSystem(
  resolver: SystemContextResolver,
  connection: IAbapConnection,
): Promise<SystemLookup> {
  let answer: ResolvedSystemContext;
  try {
    answer = await resolver(connection);
  } catch (error) {
    if (isCredentialFailure(error)) throw error;
    return { system: null, absent: isSystemInformationUnavailable(error) };
  }
  const system = withUser(answer);
  return system === null ? { system: null, absent: false } : { system };
}

/** An answer that names no user (a non-blank string) is no information. */
function withUser(system: ResolvedSystemContext): KnownSystemContext | null {
  if (system === null || typeof system !== 'object') return null;
  const user: unknown = system.responsible;
  return typeof user === 'string' && user.trim() !== '' ? system : null;
}

/** A connection's parameters as made, and whether they are kept. */
export interface MadeParameters {
  readonly parameters: ResolvedSystemContext;
  readonly kept: boolean;
  /** The lookup they were made from. */
  readonly lookup: SystemLookup;
}

/**
 * A connection's parameters from its lookup: the rules' (kept), else the
 * information (kept), else none (not kept: the next call asks again). A
 * refusal of the rules is thrown.
 */
export function parametersOf(
  lookup: SystemLookup,
  rules: SystemContextRules | null | undefined,
  call: () => SystemCall,
): MadeParameters {
  if (rules) {
    return {
      parameters: rules.parametersFor(lookup, call()),
      kept: true,
      lookup,
    };
  }
  return { parameters: lookup.system, kept: lookup.system !== null, lookup };
}

const memo = new WeakMap<
  SystemContextResolver,
  WeakMap<object, Promise<MadeParameters>>
>();

/**
 * `connection`'s parameters, made once per resolver and connection
 * (`lookUpSystem`, then `parametersOf`). Concurrent callers share the
 * in-flight promise; kept parameters are kept; any other, and a rejection,
 * is dropped, so the next request asks again.
 */
export function parametersOnce(
  resolver: SystemContextResolver,
  connection: IAbapConnection,
  rules: SystemContextRules | null | undefined,
  call: () => SystemCall,
): Promise<MadeParameters> {
  let perConnection = memo.get(resolver);
  if (!perConnection) {
    perConnection = new WeakMap();
    memo.set(resolver, perConnection);
  }
  const known = perConnection.get(connection);
  if (known) return known;

  // async wrapper: an injected resolver that throws synchronously rejects too.
  const pending = (async () =>
    parametersOf(await lookUpSystem(resolver, connection), rules, call))();
  perConnection.set(connection, pending);
  const drop = () => {
    if (perConnection.get(connection) === pending) {
      perConnection.delete(connection);
    }
  };
  pending.then((made) => {
    if (!made.kept) drop();
  }, drop);
  return pending;
}

/**
 * The responsible a call states: the request's (`x-sap-responsible`), the
 * process's (`SAP_RESPONSIBLE`) or, after them, `destinationResponsible` —
 * the destination's own `SAP_RESPONSIBLE`; `undefined` when none is stated
 * (absent or blank).
 */
export function statedResponsibleOf(
  destinationResponsible?: string,
): string | undefined {
  for (const value of [
    getStatedSystemContext().responsible,
    destinationResponsible,
  ]) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return undefined;
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
      masterLanguage: getStatedSystemContext().masterLanguage,
    },
    fn,
  );
}

/**
 * What a host's connection (one the factory did not build) states for its
 * parameters, as the call that makes them sees it: the stated responsible,
 * the login (`statedUserOf`: what the connection or its request scope states,
 * never the process's environment), the master
 * system, the kind (`systemType`: the stated one).
 */
export function statedCallOf(
  connection: object,
  systemType: string | undefined,
): SystemCall {
  const stated = getStatedSystemContext();
  return {
    kind: systemKindOf(connection, process.env, systemType),
    responsible: statedResponsibleOf(),
    login: statedUserOf(connection, getRequestContext()?.login),
    masterSystem: stated.masterSystem,
    warn: (message) => logger.warn(message),
  };
}

/**
 * Run `fn` with the responsible person and master system of the
 * connection's parameters (`parametersOnce`). `fn` runs unchanged when there
 * is no resolver (nothing is looked up), no connection, or the context was
 * already applied around this call; with the configured values when the
 * parameters are none. A credential failure is the call's as it came, and a
 * refusal of the rules the call's: `fn` does not run. The rules read the
 * lookup by the connection's kind (`systemType`: the stated one, for a
 * connection the factory did not build), whatever the resolver.
 */
export async function withResolvedSystemContext<T>(
  connection: IAbapConnection | null | undefined,
  fn: () => Promise<T> | T,
  resolver: SystemContextResolver | null = null,
  systemType?: string,
  rules?: SystemContextRules | null,
): Promise<T> {
  if (!resolver || !connection || applied.getStore() === true) return fn();
  const { parameters } = await parametersOnce(resolver, connection, rules, () =>
    statedCallOf(connection, systemType),
  );
  return applyResolved(parameters, fn);
}

/**
 * Run `fn` with the responsible person and master system the request lacks
 * filled from parameters already made — the server's, with its connection
 * (spec §5.7: no send outside the connection's main flow). Sends nothing.
 * `undefined`: nothing was made (no resolver), and `fn` runs as it is.
 */
export async function withKnownSystemContext<T>(
  resolved: ResolvedSystemContext | undefined,
  fn: () => Promise<T> | T,
): Promise<T> {
  if (resolved === undefined) return fn();
  return applyResolved(resolved, fn);
}

function applyResolved<T>(
  resolved: ResolvedSystemContext,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  // No parameters: the configured values apply as they are.
  if (!resolved) return applied.run(true, fn);

  // The parameters win over everything configured: the stated responsible
  // and master system, and the login that would stand in.
  return runWithRequestContext(
    {
      ...getRequestContext(),
      login: undefined,
      responsible: resolved.responsible,
      masterSystem: resolved.masterSystem,
      // The stated value, not the scope's: inside a scope it IS the
      // scope's value, so an outer scope's language is kept; outside any
      // scope it is the process language, which entering this new scope
      // would otherwise drop, since a scope's masterLanguage never falls
      // back to the process.
      masterLanguage: getStatedSystemContext().masterLanguage,
    },
    () => applied.run(true, fn),
  );
}
