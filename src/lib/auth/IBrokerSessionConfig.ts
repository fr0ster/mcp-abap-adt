/**
 * Configuration for creating an AuthBroker from a ready session
 *
 * This interface allows creating a broker without knowing WHERE the config came from
 * (.env file, service key, HTTP headers, etc.)
 *
 * Factory decides what stores/providers to create based on authType and available data:
 * - basic auth: only sessionStore (credentials are static)
 * - jwt auth: sessionStore + tokenProvider (for token refresh)
 * - jwt auth + serviceKeyPath: serviceKeyStore + sessionStore + tokenProvider
 */

import type { ILogger } from '@mcp-abap-adt/interfaces';

/**
 * Connection configuration from any source (.env, service key, headers)
 */
export interface IConnectionConfig {
  /** SAP system URL */
  serviceUrl: string;
  /** SAP client number */
  sapClient?: string;
  /** Authentication type */
  authType: 'basic' | 'jwt';

  // Basic auth fields
  /** Username for basic auth */
  username?: string;
  /** Password for basic auth */
  password?: string;

  // JWT auth fields
  /** JWT token for jwt auth */
  authorizationToken?: string;
  /** Refresh token for jwt auth */
  refreshToken?: string;

  // UAA fields (for token refresh via client_credentials)
  /** UAA URL for token refresh */
  uaaUrl?: string;
  /** UAA client ID */
  uaaClientId?: string;
  /** UAA client secret */
  uaaClientSecret?: string;
}

/**
 * Configuration for broker creation from a ready session
 */
export interface IBrokerSessionConfig {
  /** Broker key (destination name or 'default') */
  brokerKey: string;

  /** Connection configuration (from .env, service key, headers, etc.) */
  connectionConfig: IConnectionConfig;

  /** Path to service keys directory (optional - if present, creates serviceKeyStore) */
  serviceKeyPath?: string;

  /** Path to sessions directory (optional - uses in-memory if not provided) */
  sessionStorePath?: string;

  /** Store type hint (abap or btp) */
  storeType?: 'abap' | 'btp';

  /** Use unsafe (file-based) session store */
  unsafe?: boolean;

  /** Port for browser auth callback (for JWT refresh) */
  browserAuthPort?: number;

  /** Browser type for OAuth (system, headless, none) */
  browser?: string;

  /** Logger instance */
  logger?: ILogger;
}

/**
 * Broker creation mode based on authType and available data
 */
export type BrokerMode =
  | 'session-only' // basic auth: only sessionStore
  | 'session-provider' // jwt auth: sessionStore + tokenProvider
  | 'full'; // jwt + serviceKey: all stores + provider
