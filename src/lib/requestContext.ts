import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request/session-scoped context for values that arrive per HTTP/SSE request
 * (e.g. the `x-sap-language` header) and must NOT live in a process-global
 * cache, otherwise they leak across requests, sessions, and connection modes
 * (direct-header vs broker/destination).
 *
 * stdio mode never enters a request scope, so consumers fall back to the
 * process-level system context there.
 */
export interface RequestContext {
  /** Master/original language for created objects (adtcore:masterLanguage), from x-sap-language. */
  masterLanguage?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` (and everything it awaits) with the given request-scoped context. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * The active request/session context, or `undefined` when not inside a
 * request scope (e.g. stdio mode). `undefined` means "no scope" and is
 * distinct from a scope whose `masterLanguage` is unset.
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
