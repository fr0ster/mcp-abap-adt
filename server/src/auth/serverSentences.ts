/**
 * The server's own sentences (spec §7.4, D28): added beside a chain failure,
 * keyed on its `kind` and on the server's own state — never on its words.
 * A4's answer renders them as `server`; here they are decided.
 */

import type { IAuthProviderError } from '@mcp-abap-adt/interfaces-auth';

/** How the provider renews (`--renewal`, D11). */
export type RenewalMode = 'refresh-then-login' | 'refresh-only';

export const RENEWAL_MODES: readonly RenewalMode[] = [
  'refresh-then-login',
  'refresh-only',
];

/** D11: a renewal that would need a login, under `--renewal=refresh-only`. */
export const REFRESH_ONLY_SENTENCE =
  'Logins are off (`--renewal=refresh-only`): log in with `mcp-auth`, or start without it.';

/** D17: a provider call behind the closed gate, or a login after the shutdown began. */
export const SHUTDOWN_SENTENCE = 'The server is shutting down.';

export interface ServerState {
  readonly renewal: RenewalMode;
  readonly shuttingDown: boolean;
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
    error.kind === 'interactive-login' &&
    error.facts.outcome === 'aborted' &&
    state.shuttingDown
  ) {
    return SHUTDOWN_SENTENCE;
  }
  return undefined;
}
