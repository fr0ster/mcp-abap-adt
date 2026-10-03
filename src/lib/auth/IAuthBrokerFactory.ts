/**
 * What a session's server needs from the destinations, and the factory's
 * whole surface.
 */

import type { AuthBroker } from '@mcp-abap-adt/auth-broker';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';

export interface IDestinations {
  /** The connector's settings: URL, client, auth type, connection type — no secret. */
  settingsFor(destination: string): Promise<SapConfig>;
  /** The destination's provider, counted while it works. */
  getProvider(destination: string): Promise<IAuthProvider>;
}

/** What `settle` found. */
export interface SettleReport {
  /** Provider calls still running at the deadline: their result is lost. */
  abandoned: number;
  /** `"<destination>": <ErrorClass>` for each session secret not stored. */
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
   * Closes the gate on provider calls, waits for the ones in progress up to
   * `deadlineMs`, then flush()es every broker built.
   */
  settle(deadlineMs: number): Promise<SettleReport>;
}
