/**
 * What core's stdio server needs from the destinations, and the factory's
 * whole surface. `DestinationSystemContext` stays lib's: the sources fill it,
 * and lib's server reads it for each call's scope.
 */

import type { AuthBroker } from '@mcp-abap-adt/auth-broker';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import type { DestinationSystemContext } from '@mcp-abap-adt/lib/auth';

export interface IDestinations {
  /** The connector's settings: URL, client, auth type, connection type — no secret. */
  settingsFor(destination: string): Promise<SapConfig>;
  /**
   * The destination's provider, counted while it works. Asked per request,
   * with the request's `signal`: the broker answers its cached provider while
   * the destination is unchanged, and the signal releases this caller alone.
   */
  getProvider(
    destination: string,
    options?: { readonly signal?: AbortSignal | undefined },
  ): Promise<IAuthProvider>;
  /**
   * The responsible and master system the destination's own `.env` states
   * (the `--env` file, or `sessions/<destination>.env`). Optional: a server
   * whose destinations do not answer it falls back to the process
   * configuration.
   */
  systemContextFor?(destination: string): Promise<DestinationSystemContext>;
}

/** What `settle` found. */
export interface SettleReport {
  /** Provider calls still running at the deadline: their result is lost. */
  abandoned: number;
  /**
   * `"<destination>": <reason>` for each session secret not stored, the
   * reason auth-errors' `classify(entry, 'persisting-tokens')`.
   */
  notStored: string[];
}

export interface IAuthBrokerFactory extends IDestinations {
  /** The destination the process serves when a request names none. */
  readonly defaultDestination: string | undefined;
  /**
   * One broker per destination, built on first use, then cached.
   * A consumer that connects must use `getProvider` instead: the broker's own
   * `getProvider` is not counted and bypasses the shutdown gate.
   */
  getBroker(destination: string): Promise<AuthBroker>;
  /**
   * Closes the gate on provider calls, disposes the login strategies it
   * composed, waits for the calls in progress up to `deadlineMs`, then
   * `flush({ signal })`es every broker built.
   */
  settle(
    deadlineMs: number,
    options?: { readonly signal?: AbortSignal | undefined },
  ): Promise<SettleReport>;
}
