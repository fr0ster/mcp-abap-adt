/**
 * Configuration of `AuthBrokerFactory`: where destinations live and what an
 * interactive login needs. The launcher builds it from the parameters; the
 * library adds no default collaborator (H2).
 */

import type { IAuthorizationStrategy } from '@mcp-abap-adt/interfaces-auth';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';

export interface IAuthBrokerFactoryConfig {
  /**
   * The `.env` file served as the destination `default`, and the parameter it
   * came from as the user gave it (`--env`, `--env-path`, `MCP_ENV_PATH`, the
   * YAML key, `working directory .env`): the source names the refusal of a
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
  /** The browser of an interactive login (`--browser`). */
  browser: string;
  /** The callback port of an interactive login; the strategy's default when absent. */
  browserAuthPort?: number;
  /** How the connector reaches the system (`--connection-type`). */
  connectionType?: 'http' | 'rfc';
  /**
   * Builds the browser strategy of the `authorization_code` handler. The
   * launcher passes auth-providers' `browserCallbackStrategy`; there is no
   * default here.
   */
  browserStrategy: (options: {
    browser: string;
    port?: number;
  }) => IAuthorizationStrategy<string>;
  logger?: ILogger;
}
