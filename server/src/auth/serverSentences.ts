/**
 * The server's own sentences: added beside a chain failure,
 * keyed on its `kind` and on the server's own state — never on its words.
 * The failure answer renders them as `server`; here they are decided.
 */

import type { IAuthProviderError } from '@mcp-abap-adt/interfaces-auth';
import { SHUTDOWN_SENTENCE } from '@mcp-abap-adt/lib/state';

/** How the provider renews (`--renewal`). */
export type RenewalMode = 'refresh-then-login' | 'refresh-only';

export const RENEWAL_MODES: readonly RenewalMode[] = [
  'refresh-then-login',
  'refresh-only',
];

/** A renewal that would need a login, under `--renewal=refresh-only`. */
export const REFRESH_ONLY_SENTENCE =
  'Logins are off (`--renewal=refresh-only`): log in with `mcp-auth`, or start without it.';

/**
 * A provider call behind the closed gate, a login after the shutdown
 * began, or a call a latch refused — lib's one sentence.
 */
export { SHUTDOWN_SENTENCE };

/**
 * A session write that did not land, under `onWriteFailure: 'fail'`
 * (the `--env` / `--env-path` file): `unknown` `persisting-tokens`.
 */
export const PERSISTING_TOKENS_SENTENCE =
  "The session could not be written to the destination's file.";

/**
 * The login was ended by the login bound, named as it was set —
 * `stated` (`` `--login-timeout=300` ``, `` `MCP_LOGIN_TIMEOUT=300` ``, …).
 */
export function loginTimeoutSentence(stated: string): string {
  return `The login was ended by the server's login timeout (${stated}).`;
}

export interface ServerState {
  readonly renewal: RenewalMode;
  readonly shuttingDown: boolean;
  /** `--login-timeout`: which logins it ended, and how it was set; absent: no bound. */
  readonly loginBound?:
    | {
        readonly stated: string;
        ended(error: IAuthProviderError): boolean;
      }
    | undefined;
}

/** The server's sentence for `error` in `state`; `undefined` when it has none. */
export function serverSentence(
  error: IAuthProviderError,
  state: ServerState,
): string | undefined {
  if (error.kind === 'renewal-declined' && state.renewal === 'refresh-only') {
    return REFRESH_ONLY_SENTENCE;
  }
  if (
    error.kind === 'unknown' &&
    (error.facts as { operation?: unknown }).operation === 'persisting-tokens'
  ) {
    return PERSISTING_TOKENS_SENTENCE;
  }
  if (error.kind === 'interactive-login' && error.facts.outcome === 'aborted') {
    if (state.shuttingDown) return SHUTDOWN_SENTENCE;
    if (state.loginBound?.ended(error) === true) {
      return loginTimeoutSentence(state.loginBound.stated);
    }
  }
  return undefined;
}
