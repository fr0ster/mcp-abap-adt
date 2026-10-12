/**
 * The server's login wrapper (spec §5.5, D8).
 *
 * With one destination per process, one provider serializes its own logins
 * (its shared attempt), so no cross-destination lock is left. What the server
 * adds to the composed strategy is only this:
 *
 * - the request goes on with its own `signal` (the attempt's) and with the
 *   prompt logger in place of the broker's, so a prompt reaches the user
 *   whatever `DEBUG_AUTH_LOG` says — never stdout;
 * - `dispose()` is forwarded;
 * - the wrapper is recorded, so the factory disposes it at shutdown;
 * - under `--login-timeout` (D10), each login is bounded: the request's
 *   signal combined with the bound's, the bound cleared when it settles.
 *
 * It settles exactly when the composed strategy does: auth-providers'
 * composition settles only after its listener's sockets are closed, so the
 * callback port is free when a login ends, cancelled or not.
 */

import type {
  AuthorizationOutcome,
  AuthorizationRequest,
  IAuthorizationStrategy,
} from '@mcp-abap-adt/interfaces-auth';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';

/**
 * `--login-timeout` (D10): the bound on each login, and whether it ended the
 * last one — the server's own state its sentence is keyed on.
 */
export interface LoginBound {
  /** The bound, in milliseconds. */
  readonly ms: number;
  /** Whether the bound ended the last login; reset when a login starts. */
  fired: boolean;
}

/** A bound of `ms` milliseconds, not fired. */
export function loginBound(ms: number): LoginBound {
  return { ms, fired: false };
}

export interface ServerLoginContext {
  /** The prompt logger: `info` on stderr (see `promptLogger`). */
  readonly logger: ILogger;
  /** Records the wrapper for the factory's disposal at shutdown. */
  record(strategy: IAuthorizationStrategy<string>): void;
  /** `--login-timeout`; absent: no bound. */
  readonly bound?: LoginBound | undefined;
}

/**
 * The logger a login prompts through: `info` — the level auth-providers'
 * strategies prompt at — is one stderr line always; `warn`, `error` and
 * `debug` stay the broker's diagnostics, gated by `DEBUG_AUTH_LOG`.
 */
export function promptLogger(
  stderr: (line: string) => void,
  diagnostics: ILogger,
): ILogger {
  return {
    info: (message: string) => stderr(message),
    warn: (message, meta) => diagnostics.warn(message, meta),
    error: (message, meta) => diagnostics.error(message, meta),
    debug: (message, meta) => diagnostics.debug(message, meta),
  };
}

export function serverLogin(
  strategy: IAuthorizationStrategy<string>,
  context: ServerLoginContext,
): IAuthorizationStrategy<string> {
  const pass = (request: AuthorizationRequest, signal?: AbortSignal) =>
    strategy.authorize({
      buildAuthorizationUrl: (redirectUri: string) =>
        request.buildAuthorizationUrl(redirectUri),
      signal,
      logger: context.logger,
    });
  const wrapped: IAuthorizationStrategy<string> = {
    authorize: (
      request: AuthorizationRequest,
    ): Promise<AuthorizationOutcome<string>> => {
      const bound = context.bound;
      if (bound === undefined) return pass(request, request.signal);
      return bounded(bound, request, (signal) => pass(request, signal));
    },
    dispose: () => strategy.dispose?.() ?? Promise.resolve(),
  };
  context.record(wrapped);
  return wrapped;
}

/**
 * One login under `--login-timeout` (D10): the strategy gets the request's
 * signal combined with the bound's, so either ends the login. The bound is
 * the login's, not the request's: its timer starts with the login and is
 * cleared when the login settles, so no timer outlives it. Whether the bound
 * ended this login is kept on `bound` — reset as the login starts.
 */
async function bounded(
  bound: LoginBound,
  request: AuthorizationRequest,
  run: (signal: AbortSignal) => Promise<AuthorizationOutcome<string>>,
): Promise<AuthorizationOutcome<string>> {
  bound.fired = false;
  const elapsed = new AbortController();
  const timer = setTimeout(() => {
    bound.fired = true;
    elapsed.abort();
  }, bound.ms);
  const signal =
    request.signal === undefined
      ? elapsed.signal
      : AbortSignal.any([request.signal, elapsed.signal]);
  try {
    return await run(signal);
  } finally {
    clearTimeout(timer);
  }
}
