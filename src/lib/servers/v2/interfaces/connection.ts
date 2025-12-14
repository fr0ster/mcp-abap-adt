/**
 * Connection provider interfaces
 *
 * Connection provider determines whether to use service keys + AuthBroker or only headers from client
 */

/**
 * Service key structure
 */
export interface IServiceKey {
  destination: string;
  url: string;
  uaaUrl?: string;
  clientId?: string;
  clientSecret?: string;
  // Additional fields from service key JSON
  [key: string]: any;
}

/**
 * Token data structure
 */
export interface ITokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

/**
 * Connection request
 */
export interface IConnectionRequest {
  /** Session identifier */
  sessionId: string;
  /** Destination name (only for LOCAL mode) */
  destination?: string;
  /** HTTP headers (only for REMOTE mode) */
  headers?: Record<string, string>;
}

/**
 * Connection parameters to SAP system
 */
export interface IConnectionParams {
  /** SAP system URL */
  sapUrl: string;
  /** Authentication information */
  auth: {
    type: 'jwt' | 'basic';
    jwtToken?: string;
    refreshToken?: string;
    username?: string;
    password?: string;
  };
  /** Client number (optional) */
  client?: string;
}

/**
 * Connection provider interface
 *
 * Determines whether to use service keys + AuthBroker (LOCAL mode)
 * or only headers from client (REMOTE mode)
 */
export interface IConnectionProvider {
  /** Provider mode */
  readonly mode: 'LOCAL' | 'REMOTE';

  /**
   * Gets connection parameters for session
   * @param request - Request with session information and destination/headers
   * @returns Connection parameters to SAP system
   */
  getConnectionParams(request: IConnectionRequest): Promise<IConnectionParams>;

  /**
   * Updates connection parameters (e.g., after token refresh)
   * @param sessionId - Session identifier
   * @param params - Partial connection parameters to update
   */
  updateConnectionParams(sessionId: string, params: Partial<IConnectionParams>): Promise<void>;
}

/**
 * Service key store interface
 *
 * Abstraction for reading service keys from various sources
 */
export interface IServiceKeyStore {
  /**
   * Gets service key for destination
   * @param destination - Destination name
   * @returns Service key
   */
  getServiceKey(destination: string): Promise<IServiceKey>;

  /**
   * Checks if service key exists for destination
   * @param destination - Destination name
   * @returns True if service key exists
   */
  hasServiceKey(destination: string): Promise<boolean>;

  /**
   * Lists available destinations
   * @returns Array of destination names
   */
  listDestinations(): Promise<string[]>;
}

/**
 * Session store interface
 *
 * Abstraction for storing tokens and sessions
 */
export interface ISessionStore {
  /**
   * Saves tokens for destination
   * @param destination - Destination name
   * @param tokens - Token data
   */
  saveTokens(destination: string, tokens: ITokenData): Promise<void>;

  /**
   * Gets tokens for destination
   * @param destination - Destination name
   * @returns Token data or null if not found
   */
  getTokens(destination: string): Promise<ITokenData | null>;

  /**
   * Deletes tokens for destination
   * @param destination - Destination name
   */
  deleteTokens(destination: string): Promise<void>;
}

/**
 * Token provider interface
 *
 * Abstraction for obtaining tokens from BTP or other sources
 */
export interface ITokenProvider {
  /**
   * Gets token from service key
   * @param serviceKey - Service key
   * @returns Token data
   */
  getToken(serviceKey: IServiceKey): Promise<ITokenData>;

  /**
   * Refreshes token using refresh token
   * @param serviceKey - Service key
   * @param refreshToken - Refresh token
   * @returns New token data
   */
  refreshToken(serviceKey: IServiceKey, refreshToken: string): Promise<ITokenData>;
}

/**
 * Auth broker factory interface
 *
 * Creates and manages AuthBroker instances with injected dependencies
 */
export interface IAuthBrokerFactory {
  /**
   * Creates or returns existing AuthBroker for session
   * ServiceKeyStore, SessionStore, and TokenProvider are injected into AuthBroker
   * @param sessionId - Session identifier
   * @param destination - Destination name
   * @returns AuthBroker instance
   */
  getOrCreateBroker(sessionId: string, destination: string): Promise<any>; // TODO: Import AuthBroker type from @mcp-abap-adt/auth-broker

  /**
   * Gets existing AuthBroker
   * @param sessionId - Session identifier
   * @param destination - Destination name (optional, but recommended)
   * @returns AuthBroker instance or undefined
   */
  getBroker(sessionId: string, destination?: string): any | undefined; // TODO: Import AuthBroker type

  /**
   * Deletes AuthBroker for session
   * @param sessionId - Session identifier
   * @param destination - Destination name (optional, if not provided deletes all brokers for session)
   */
  deleteBroker(sessionId: string, destination?: string): void;

  /**
   * Clears all brokers (on shutdown)
   */
  clearAll(): void;
}

/**
 * Header validator interface
 *
 * Validates and extracts connection parameters from HTTP headers
 */
export interface IHeaderValidator {
  /**
   * Validates and extracts connection parameters from headers
   * @param headers - HTTP headers
   * @returns Validated connection parameters
   */
  validateAndExtract(headers: Record<string, string>): Promise<IConnectionParams>;
}
