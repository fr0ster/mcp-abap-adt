/**
 * Configuration of `AuthBrokerFactory`: where destinations live and what an
 * interactive login needs. The launcher builds it from the parameters; the
 * factory adds no default collaborator (H2).
 */

import type {
  IAuthorizationStrategy,
  IBrowser,
} from '@mcp-abap-adt/interfaces-auth';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import type { RenewalMode } from './serverSentences.js';

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
  /** `--renewal` (D11); absent: `refresh-then-login`. */
  renewal?: RenewalMode;
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
