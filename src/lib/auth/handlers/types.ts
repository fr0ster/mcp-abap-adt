import type { AuthBrokerConfig } from '@mcp-abap-adt/auth-broker';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthorizationStrategy } from '@mcp-abap-adt/interfaces-auth';
import type { DestinationGrant } from '@mcp-abap-adt/interfaces-auth-broker';
import type { LoginLock } from '../loginLock.js';
import type { AuthType } from '../vocabulary.js';

/**
 * What a handler may use to build its broker options. (Not `HandlerContext`:
 * that name is the tool handlers' context.)
 */
export interface AuthHandlerContext {
  browser: string;
  browserAuthPort?: number;
  loginLock: LoginLock;
  /** The launcher passes auth-providers' `browserCallbackStrategy`; no default here. */
  browserStrategy: (options: {
    browser: string;
    port?: number;
  }) => IAuthorizationStrategy<string>;
}

export interface AuthenticationHandler {
  readonly authType: AuthType;
  readonly grantType?: DestinationGrant;
  /** The broker options this authentication needs — nothing else. */
  brokerOptions(context: AuthHandlerContext): Partial<AuthBrokerConfig>;
  /** Refuses settings this authentication cannot use; most accept all. */
  checkSettings?(settings: SapConfig): void;
}
