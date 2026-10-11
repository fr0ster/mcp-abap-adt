import type { AuthBrokerConfig } from '@mcp-abap-adt/auth-broker';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type {
  IAuthorizationStrategy,
  IBrowser,
} from '@mcp-abap-adt/interfaces-auth';
import type { DestinationGrant } from '@mcp-abap-adt/interfaces-auth-broker';
import type { AuthType } from '@mcp-abap-adt/lib/auth';
import type { LoginStrategyOptions } from '../IAuthBrokerFactoryConfig.js';
import type { ServerLoginContext } from '../serverLogin.js';

/**
 * What a handler may use to build its broker options. (Not `HandlerContext`:
 * that name is the tool handlers' context.)
 */
export interface AuthHandlerContext {
  browser?: IBrowser;
  /** `--browser` names a browser this platform has none of: the words (`browserFor`). */
  browserUnavailable?: string;
  browserAuthPort?: number;
  /** The launcher passes auth-providers' `browserCallbackStrategy`; no default here. */
  browserStrategy: (
    options: LoginStrategyOptions,
  ) => IAuthorizationStrategy<string>;
  /** The prompt logger and the factory's record of composed logins. */
  login: ServerLoginContext;
}

export interface AuthenticationHandler {
  readonly authType: AuthType;
  readonly grantType?: DestinationGrant;
  /** The broker options this authentication needs — nothing else. */
  brokerOptions(context: AuthHandlerContext): Partial<AuthBrokerConfig>;
  /** Refuses settings this authentication cannot use; most accept all. */
  checkSettings?(settings: SapConfig, context: AuthHandlerContext): void;
}
