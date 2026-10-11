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
 * - the wrapper is recorded, so the factory disposes it at shutdown.
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

export interface ServerLoginContext {
  /** The prompt logger: `info` on stderr (see `promptLogger`). */
  readonly logger: ILogger;
  /** Records the wrapper for the factory's disposal at shutdown. */
  record(strategy: IAuthorizationStrategy<string>): void;
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
  const wrapped: IAuthorizationStrategy<string> = {
    authorize: (
      request: AuthorizationRequest,
    ): Promise<AuthorizationOutcome<string>> =>
      strategy.authorize({
        buildAuthorizationUrl: (redirectUri: string) =>
          request.buildAuthorizationUrl(redirectUri),
        signal: request.signal,
        logger: context.logger,
      }),
    dispose: () => strategy.dispose?.() ?? Promise.resolve(),
  };
  context.record(wrapped);
  return wrapped;
}
