/**
 * Configuration of `AuthBrokerFactory`: where destinations live and what an
 * interactive login needs. The launcher builds it from the parameters; the
 * factory adds no default collaborator.
 */

import type {
  IAuthorizationStrategy,
  IBrowser,
} from '@mcp-abap-adt/interfaces-auth';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import type { DestinationKeyValues } from '@mcp-abap-adt/lib/config';
import type { RenewalMode } from './serverSentences.js';

/** The destination keys of the start parameters, by their rank against the means. */
export interface StartDestinationKeys {
  /** `--<key>` or `SAP_<KEY>` in the process's own environment. */
  readonly overMeans: DestinationKeyValues;
  /** `<key>` in YAML. */
  readonly underMeans: DestinationKeyValues;
}

/** What the login strategy is built from: auth-providers' `CallbackStrategyOptions`. */
export interface LoginStrategyOptions {
  /** The browser that opens the URL; absent: the URL is shown on stderr. */
  browser?: IBrowser;
  /** The callback port; absent: the strategy's own (61001). */
  port?: number;
}

export interface IAuthBrokerFactoryConfig {
  /**
   * The `.env` file served as the destination `default`, and the parameter it
   * came from as the user gave it (`--env`, `--env-path`, `MCP_ENV_PATH`, the
   * YAML key): the source names the refusal of a
   * file that does not exist. No default: whoever sets the path knows where it
   * came from.
   */
  envFile?: { path: string; source: string };
  /** `--mcp=X`: the destination served when a request names none. */
  mcpDestination?: string;
  /** Base of `service-keys/` and `sessions/` (`--auth-broker-path`). */
  authBrokerPath?: string;
  /** Whether a named destination's secret is written to `sessions/`. */
  unsafe: boolean;
  /**
   * The browser of an interactive login (`--browser`, `--browser-program`,
   * mapped by `browserFor`); absent: none — the URL on stderr.
   */
  browser?: IBrowser;
  /**
   * `--browser` names a browser this platform has none of (`browserFor`'s
   * `unavailable` words): a `jwt` / `authorization_code` destination is
   * refused for it at the startup check; the others never log in.
   */
  browserUnavailable?: string;
  /** The callback port of an interactive login; the strategy's default when absent. */
  browserAuthPort?: number;
  /** How the connector reaches the system (`--connection-type`). */
  connectionType?: 'http' | 'rfc';
  /**
   * The system type in effect (`--system-type`): ABAP Cloud over RFC is
   * refused naming both keys.
   */
  systemType?: 'onprem' | 'cloud' | 'legacy';
  /**
   * The destination keys the start parameters state (the RFC address, the
   * client, the language), by rank: `overMeans` — the CLI and the process's
   * own environment — beats the destination's means (its `.env`, then a
   * service key's fallback), which beat `underMeans` — YAML. Absent: none
   * stated.
   */
  destinationKeys?: StartDestinationKeys;
  /** `--renewal`; absent: `refresh-then-login`. */
  renewal?: RenewalMode;
  /**
   * `--login-timeout` in milliseconds: each browser login is ended
   * `aborted` once it has run this long. Absent: no bound — a login ends on
   * its result, the user's refusal or its request's end.
   */
  loginTimeoutMs?: number;
  /**
   * How the bound was set, as the login-bound sentence names it — the launcher's form
   * as the user gave it (`` `--login-timeout=300` ``). Absent: the option
   * itself, `` `loginTimeoutMs: <ms>` ``.
   */
  loginTimeoutStated?: string;
  /**
   * `--auth-debug`: the brokers are built with `authDebug: true`, so a
   * refused token request's debug line names its secrets' first and last four
   * characters. Absent: off. The caller routes `logger` to stderr with it.
   */
  authDebug?: boolean;
  /**
   * Builds the login strategy of the `authorization_code` handler. The
   * launcher passes auth-providers' `browserCallbackStrategy`; there is no
   * default here. The factory wraps it in `serverLogin`.
   */
  browserStrategy: (
    options: LoginStrategyOptions,
  ) => IAuthorizationStrategy<string>;
  /** The logger a login prompts through (`promptLogger`: `info` on stderr). */
  promptLogger: ILogger;
  logger?: ILogger;
}
