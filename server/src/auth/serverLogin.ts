/**
 * The server's login wrapper.
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
 * - under `--login-timeout`, each login is bounded: the request's
 *   signal combined with the bound's, the bound cleared when it settles.
 *
 * It settles exactly when the composed strategy does: auth-providers'
 * composition settles only after its listener's sockets are closed, so the
 * callback port is free when a login ends, cancelled or not.
 */

import {
  AuthProviderFailure,
  authError,
  readFailure,
} from '@mcp-abap-adt/auth-errors';
import type {
  AuthorizationOutcome,
  AuthorizationRequest,
  IAuthorizationStrategy,
  IAuthProviderError,
} from '@mcp-abap-adt/interfaces-auth';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';

/**
 * `--login-timeout`: the bound on each login, how it was stated, and
 * which logins it ended — the server's own state its sentence is keyed on.
 * A login's end is recorded on the failure that login ended with, never as
 * "the last login": another login starting before that failure is read
 * cannot take the sentence away, nor make the failure look like another
 * caller's abort.
 */
export interface LoginBound {
  /** The bound, in milliseconds. */
  readonly ms: number;
  /** How the bound was set, as the sentence names it (`` `--login-timeout=300` ``). */
  readonly stated: string;
  /** Whether the bound ended the login that failed with `error`. */
  ended(error: IAuthProviderError): boolean;
  /** Records that the bound ended the login that failed with `error`. */
  record(error: IAuthProviderError): void;
}

/**
 * A bound of `ms` milliseconds; `stated` is how it was set (default: the
 * embedder's option, `` `loginTimeoutMs: <ms>` ``).
 */
export function loginBound(
  ms: number,
  stated = `\`loginTimeoutMs: ${ms}\``,
): LoginBound {
  const endedByBound = new WeakSet<IAuthProviderError>();
  return {
    ms,
    stated,
    ended: (error) => endedByBound.has(error),
    record: (error) => {
      endedByBound.add(error);
    },
  };
}

export interface ServerLoginContext {
  /** The prompt logger: `info` on stderr (see `promptLogger`). */
  readonly logger: ILogger;
  /** Records the wrapper for the factory's disposal at shutdown. */
  record(strategy: IAuthorizationStrategy<string>): void;
  /** `--login-timeout`; absent: no bound. */
  readonly bound?: LoginBound | undefined;
  /**
   * Whether the shutdown began: from then on no interactive login starts —
   * it is refused `interactive-login` `aborted`, answered with the shutdown
   * sentence. Absent: never.
   */
  readonly shuttingDown?: (() => boolean) | undefined;
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

/**
 * How the chain logs a session write that did not land under
 * `onWriteFailure: 'continue'` (a named destination): auth-broker's
 * writer (`[AuthBroker] Session write for <destination> failed; …`) and
 * auth-providers' `refreshStatePersistence`. That line is a report the user
 * must see. Read by its fixed opening words — the chain gives it no code.
 */
export const WRITE_FAILED_WORDS = [
  '[AuthBroker] Session write for ',
  '[refreshStatePersistence] Writing the tokens failed',
] as const;

function isWriteFailed(message: unknown): boolean {
  return (
    typeof message === 'string' &&
    WRITE_FAILED_WORDS.some((words) => message.startsWith(words)) &&
    message.includes('fail')
  );
}

export function brokerLogger(
  stderr: (line: string) => void,
  diagnostics: ILogger,
): ILogger {
  return {
    info: (message, meta) => diagnostics.info(message, meta),
    warn: (message, meta) => {
      if (isWriteFailed(message)) {
        // The server's own words and the line's `logFields` — never the
        // chain's message, which names a destination and a path.
        stderr(
          meta === undefined
            ? '[MCP] A session write did not land'
            : `[MCP] A session write did not land: ${JSON.stringify(meta)}`,
        );
        return;
      }
      diagnostics.warn(message, meta);
    },
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
      if (context.shuttingDown?.() === true) {
        return Promise.reject(
          new AuthProviderFailure(
            authError['interactive-login']({ outcome: 'aborted' }),
          ),
        );
      }
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
 * One login under `--login-timeout`: the strategy gets the request's
 * signal combined with the bound's, so either ends the login. The bound is
 * the login's, not the request's: its timer starts with the login and is
 * cleared when the login settles, so no timer outlives it. A login the bound
 * ended has its failure recorded on `bound`.
 */
async function bounded(
  bound: LoginBound,
  request: AuthorizationRequest,
  run: (signal: AbortSignal) => Promise<AuthorizationOutcome<string>>,
): Promise<AuthorizationOutcome<string>> {
  const elapsed = new AbortController();
  const timer = setTimeout(() => elapsed.abort(), bound.ms);
  const signal =
    request.signal === undefined
      ? elapsed.signal
      : AbortSignal.any([request.signal, elapsed.signal]);
  try {
    return await run(signal);
  } catch (error) {
    // Ended by the bound — not by the request's own signal.
    if (elapsed.signal.aborted && request.signal?.aborted !== true) {
      bound.record(readFailure(error, 'token-request'));
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
