import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request/session-scoped context for values that arrive per HTTP/SSE request
 * (e.g. the `x-sap-language` header) and must NOT live in a process-global
 * cache, otherwise they leak across requests, sessions, and connection modes
 * (direct-header vs broker/destination). An embedding host that serves several
 * SAP users from one process enters the same scope around each request.
 *
 * stdio mode never enters a request scope, so consumers fall back to the
 * process-level system context there. See `getEffectiveSystemContext` for how
 * the two combine.
 */
export interface RequestContext {
  /** Master/original language for created objects (adtcore:masterLanguage), from x-sap-language. */
  masterLanguage?: string;
  /**
   * Responsible person for created objects (adtcore:responsible), as stated:
   * `x-sap-responsible`, or `SAP_RESPONSIBLE` of the request's destination.
   * When the key is present — even as `undefined` — it replaces the process
   * value (and the process login) for this request. When it is absent, the
   * process value stays.
   */
  responsible?: string;
  /**
   * The login of this request — the destination's `SAP_USERNAME`, or the
   * `x-sap-login` of an `x-sap-*` basic connection (the server enters it; a
   * destination request's `x-sap-login` logs nobody on). The responsible when
   * none is stated: after every `SAP_RESPONSIBLE` (the process one included),
   * before the process `SAP_USERNAME`. Not on a cloud connection, where the
   * login is the system's user.
   */
  login?: string;
  /**
   * Master system for created objects (adtcore:masterSystem), e.g. from
   * `x-sap-master-system`. Same presence rule as `responsible`. When none is
   * known it is left out of the request.
   */
  masterSystem?: string;
  /**
   * The debugger's terminal id, as stated: `x-sap-debug-terminal-id`, or
   * `SAP_DEBUG_TERMINAL_ID` of the request's destination. Same presence rule
   * as `responsible`; when none is stated the debugger generates one.
   */
  debugTerminalId?: string;
  /**
   * The debugger's IDE id, as stated: `x-sap-debug-ide-id`, or
   * `SAP_DEBUG_IDE_ID` of the request's destination. Same presence rule as
   * `debugTerminalId`.
   */
  debugIdeId?: string;
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
 * The request scope an HTTP/SSE request states in its headers:
 * `x-sap-language` as `masterLanguage` (the key always present, as #110
 * established), and `x-sap-responsible` / `x-sap-master-system` as
 * `responsible` / `masterSystem` — each of these present only when its header
 * carries a value, so a request that states none leaves the destination's
 * `.env`, the process configuration, the login and the cloud lookup to fill
 * it. `x-sap-debug-terminal-id` / `x-sap-debug-ide-id` enter the same way as
 * `debugTerminalId` / `debugIdeId`. `x-sap-login` is not read here: it is a login only on an `x-sap-*`
 * basic connection, which the server enters itself.
 */
export function requestContextFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): RequestContext {
  const responsible = headerValue(headers, 'x-sap-responsible');
  const masterSystem = headerValue(headers, 'x-sap-master-system');
  const debugTerminalId = headerValue(headers, 'x-sap-debug-terminal-id');
  const debugIdeId = headerValue(headers, 'x-sap-debug-ide-id');
  return {
    masterLanguage: headerValue(headers, 'x-sap-language'),
    ...(responsible ? { responsible } : {}),
    ...(masterSystem ? { masterSystem } : {}),
    ...(debugTerminalId ? { debugTerminalId } : {}),
    ...(debugIdeId ? { debugIdeId } : {}),
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
  type SystemContextResolver,
  withResolvedSystemContext,
} from './requestSystemResolution';
