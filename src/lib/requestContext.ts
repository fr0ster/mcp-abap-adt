import './instance.js';

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request/session-scoped context for values that arrive per HTTP/SSE request
 * (e.g. the `x-sap-language` header) and must NOT live in a process-global
 * cache, otherwise they leak across requests, sessions, and connection modes
 * (direct-header vs broker/destination). An embedding host that serves several
 * SAP users from one process enters the same scope around each request.
 *
 * stdio mode never enters a request scope, so consumers fall back to the
 * process-level system context there. See `getStatedSystemContext` for how
 * the two combine.
 */
export interface RequestContext {
  /** Master/original language for created objects (adtcore:masterLanguage), from x-sap-language. */
  masterLanguage?: string | undefined;
  /**
   * Responsible person for created objects (adtcore:responsible), as stated:
   * `x-sap-responsible`, or `SAP_RESPONSIBLE` of the request's destination.
   * When the key is present — even as `undefined` — it replaces the process
   * value (and the process login) for this request. When it is absent, the
   * process value stays.
   */
  responsible?: string | undefined;
  /**
   * The login of this request — the destination's `SAP_USERNAME`, or the
   * `x-sap-login` of an `x-sap-*` basic connection (the server enters it; a
   * destination request's `x-sap-login` logs nobody on). The responsible a
   * create takes when none is stated, after every `SAP_RESPONSIBLE` (the
   * process one included); the process `SAP_USERNAME` never stands in. Not on a cloud connection, where the
   * login is the system's user.
   */
  login?: string | undefined;
  /**
   * Master system for created objects (adtcore:masterSystem), e.g. from
   * `x-sap-master-system`. Same presence rule as `responsible`. When none is
   * known it is left out of the request.
   */
  masterSystem?: string | undefined;
  /**
   * The debugger's terminal id, as stated: `x-sap-debug-terminal-id`, or
   * `SAP_DEBUG_TERMINAL_ID` of the request's destination. Same presence rule
   * as `responsible`; when none is stated the debugger generates one.
   */
  debugTerminalId?: string | undefined;
  /**
   * The debugger's IDE id, as stated: `x-sap-debug-ide-id`, or
   * `SAP_DEBUG_IDE_ID` of the request's destination. Same presence rule as
   * `debugTerminalId`.
   */
  debugIdeId?: string | undefined;
  /**
   * The debugger's breakpoint conflict (`replace` or `refuse-if-held`), as
   * stated: `x-sap-debug-breakpoint-conflict`, or
   * `SAP_DEBUG_BREAKPOINT_CONFLICT` of the request's destination. Same
   * presence rule as `debugTerminalId`.
   */
  debugBreakpointConflict?: string | undefined;
  /**
   * The one approved git endpoint the request states (spec §5.2):
   * `x-abapgit-remote`, `x-abapgit-user`, `x-abapgit-token`, for this
   * request only (Streamable HTTP), or for the stream that stated them on
   * its opening GET (SSE). `undefined` when none of the three is given.
   */
  abapGitRemote?: AbapGitRemoteHeaders | undefined;
}

/** The git endpoint a request's headers state, each `''` when not given. */
export interface AbapGitRemoteHeaders {
  readonly url: string;
  readonly user: string;
  readonly token: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` (and everything it awaits) with the given request-scoped context. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** A header's first value, its name matched case-insensitively. */
function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  for (const [key, raw] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) return value;
  }
  return undefined;
}

/**
 * The request scope an HTTP/SSE request states in its headers, every key
 * present (24.0.0): `x-sap-language` as `masterLanguage` (#110),
 * `x-sap-responsible` / `x-sap-master-system` as `responsible` /
 * `masterSystem`, and `x-sap-debug-terminal-id` / `x-sap-debug-ide-id` /
 * `x-sap-debug-breakpoint-conflict` as `debugTerminalId` / `debugIdeId` /
 * `debugBreakpointConflict` — `undefined` when the header carries no value.
 * So a request that states none is answered by none of the process's
 * `SAP_RESPONSIBLE`, `SAP_MASTER_SYSTEM` or `SAP_DEBUG_*`: http/sse take
 * request values from headers only. The login and the connection's
 * parameters (the rules, the cloud lookup) still fill the responsible.
 * `x-abapgit-remote`, `x-abapgit-user` and `x-abapgit-token` are the
 * request's one approved git endpoint (`abapGitRemote`).
 * `x-sap-login` is not read here: it is a login only on an `x-sap-*` basic
 * connection, which the server enters itself.
 */
export function requestContextFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): RequestContext {
  const responsible = headerValue(headers, 'x-sap-responsible');
  const masterSystem = headerValue(headers, 'x-sap-master-system');
  const debugTerminalId = headerValue(headers, 'x-sap-debug-terminal-id');
  const debugIdeId = headerValue(headers, 'x-sap-debug-ide-id');
  const debugBreakpointConflict = headerValue(
    headers,
    'x-sap-debug-breakpoint-conflict',
  );
  const remote = headerValue(headers, 'x-abapgit-remote');
  const user = headerValue(headers, 'x-abapgit-user');
  const token = headerValue(headers, 'x-abapgit-token');
  return {
    masterLanguage: headerValue(headers, 'x-sap-language'),
    responsible,
    masterSystem,
    debugTerminalId,
    debugIdeId,
    debugBreakpointConflict,
    abapGitRemote:
      remote === undefined && user === undefined && token === undefined
        ? undefined
        : { url: remote ?? '', user: user ?? '', token: token ?? '' },
  };
}

/**
 * The active request/session context, or `undefined` when not inside a
 * request scope (e.g. stdio mode). `undefined` means "no scope" and is
 * distinct from a scope whose `masterLanguage` is unset.
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

// Re-exported so embedding hosts reach it through the same
// `@mcp-abap-adt/lib/request-context` entry point. It imports this module back;
// the cycle is safe because neither side reads the other at load time — every
// use is inside a function body. Kept at the bottom so this module's own
// bindings exist before the other is loaded.
export {
  defaultSystemContextResolver,
  type ResolvedSystemContext,
  type SystemCall,
  type SystemContextResolver,
  type SystemContextRules,
  type SystemLookup,
  withResolvedSystemContext,
} from './requestSystemResolution';
