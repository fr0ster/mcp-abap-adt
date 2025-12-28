/**
 * Session management helpers for low-level handler integration tests
 *
 * Uses the same approach as index.ts getOrCreateConnectionForServer:
 * - Create connection via AuthBroker (from destination or .env file directory)
 * - Fallback to getSapConfigFromEnv() if AuthBroker fails
 * - Call connect() once
 * - Extract session state directly from connection
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { AuthBroker } from '@mcp-abap-adt/auth-broker';
import { AuthorizationCodeProvider } from '@mcp-abap-adt/auth-providers';
import {
  type AbapConnection,
  createAbapConnection,
  type SapConfig,
} from '@mcp-abap-adt/connection';
import type { IServiceKeyStore, ISessionStore } from '@mcp-abap-adt/interfaces';
import { generateSessionId } from '../../../lib/sessionUtils';
import { getPlatformStoresAsync } from '../../../lib/stores';
import {
  createBrokerLogger,
  createConnectionLogger,
  createProviderLogger,
  createStoreLogger,
} from './authHelpers';
import {
  getSapConfigFromEnv,
  loadTestConfig,
  loadTestEnv,
} from './configHelpers';
import { createTestLogger } from './loggerHelpers';
import { extractSessionState } from './testHelpers';

const sessionLogger = createTestLogger('connection');

function wrapLegacyTokenProvider(
  provider: AuthorizationCodeProvider,
): AuthorizationCodeProvider & {
  getConnectionConfig: (
    _authConfig: unknown,
    _options?: unknown,
  ) => Promise<{
    connectionConfig: { authorizationToken?: string };
    refreshToken?: string;
  }>;
} {
  if (typeof (provider as any).getConnectionConfig === 'function') {
    return provider as any;
  }

  return {
    getTokens: provider.getTokens.bind(provider),
    getConnectionConfig: async () => {
      const tokenResult = await provider.getTokens();
      return {
        connectionConfig: {
          authorizationToken: tokenResult.authorizationToken,
        },
        refreshToken: tokenResult.refreshToken,
      };
    },
  } as any;
}

export interface SessionInfo {
  session_id: string;
  session_state: {
    cookies: string;
    csrf_token: string;
    cookie_store: Record<string, string>;
  };
}

/**
 * Create connection via AuthBroker (same approach as index.ts getOrCreateConnectionForServer)
 * Priority:
 * 1. If destination is provided - use AuthBroker with destination
 * 2. If no destination but .env file exists - use AuthBroker with SessionStore from .env file directory
 * 3. Fallback to getSapConfigFromEnv() if AuthBroker fails
 */
async function createConnectionViaBroker(
  destination?: string,
  envFilePath?: string,
): Promise<AbapConnection | null> {
  try {
    const config = loadTestConfig();
    const useUnsafe =
      process.env.MCP_UNSAFE === 'true' ||
      config?.auth_broker?.unsafe === true ||
      config?.auth_broker?.unsafe_session_store === true;

    // Get destination from config if not provided
    const actualDestination =
      destination ||
      config?.auth_broker?.abap?.destination ||
      config?.abap?.destination ||
      config?.environment?.destination ||
      config?.abap?.service_keys?.destination ||
      config?.abap?.sessions?.destination;

    if (!actualDestination && !envFilePath) {
      // No destination and no .env file - cannot use AuthBroker
      return null;
    }

    let sessionStore: ISessionStore;
    let serviceKeyStore: IServiceKeyStore;
    let storeType: 'abap' | 'btp';

    // Create loggers based on environment variables
    const storeLogger = createStoreLogger();

    // If no destination but .env file exists, create SessionStore from .env file directory
    // (same logic as index.ts lines 1128-1147)
    if (!actualDestination && envFilePath) {
      const envFileDir = path.dirname(envFilePath);
      const stores = await getPlatformStoresAsync(
        envFileDir,
        useUnsafe,
        'default',
        storeLogger,
      );
      serviceKeyStore = stores.serviceKeyStore;
      sessionStore = stores.sessionStore;
      storeType = stores.storeType;

      sessionLogger?.debug('Created SessionStore from .env file directory', {
        envFilePath,
        envFileDir,
        destination: 'default',
        storeType,
        unsafe: useUnsafe,
      });
    } else if (actualDestination) {
      // Use destination-based stores
      const stores = await getPlatformStoresAsync(
        undefined,
        useUnsafe,
        actualDestination,
        storeLogger,
      );
      serviceKeyStore = stores.serviceKeyStore;
      sessionStore = stores.sessionStore;
      storeType = stores.storeType;
    } else {
      return null;
    }

    const brokerDestination = actualDestination || 'default';
    const authConfig =
      (await sessionStore.getAuthorizationConfig(brokerDestination)) ||
      (await serviceKeyStore.getAuthorizationConfig(brokerDestination));
    if (!authConfig) {
      throw new Error(
        `Missing authorization config for destination "${brokerDestination}".`,
      );
    }
    const sessionConnConfig =
      await sessionStore.getConnectionConfig(brokerDestination);

    // Create loggers based on environment variables (storeLogger already created above)
    const providerLogger = createProviderLogger();
    const brokerLogger = createBrokerLogger();

    const tokenProvider = wrapLegacyTokenProvider(
      new AuthorizationCodeProvider({
        uaaUrl: authConfig.uaaUrl,
        clientId: authConfig.uaaClientId,
        clientSecret: authConfig.uaaClientSecret,
        refreshToken: authConfig.refreshToken,
        accessToken: sessionConnConfig?.authorizationToken,
        browser: 'system',
        logger: providerLogger,
      }),
    );
    const authBroker = new AuthBroker(
      {
        serviceKeyStore,
        sessionStore,
        tokenProvider,
      },
      'system',
      brokerLogger,
    );

    // Try to get connection config and token from broker
    const connConfig = await authBroker.getConnectionConfig(brokerDestination);
    if (connConfig?.serviceUrl) {
      const jwtToken = await authBroker.getToken(brokerDestination);
      if (jwtToken) {
        const config: SapConfig = {
          url: connConfig.serviceUrl,
          authType: 'jwt',
          jwtToken,
        };
        sessionLogger?.info('Using connection from auth broker', {
          destination: brokerDestination,
          url: config.url,
          authType: config.authType,
        });
        // Only pass connection logger if DEBUG_CONNECTION is set
        const connectionLogger = createConnectionLogger();
        const connectionLoggerWithCsrf = connectionLogger
          ? {
              ...connectionLogger,
              csrfToken: connectionLogger.debug,
            }
          : undefined;
        return createAbapConnection(config, connectionLoggerWithCsrf);
      }
    }
  } catch (error: any) {
    sessionLogger?.warn('Failed to create connection via AuthBroker', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return null;
}

/**
 * Create a separate connection and session for testing
 * Creates a new connection for each test to avoid shared state
 * Uses AuthBroker (from destination or .env file directory) or falls back to getSapConfigFromEnv()
 */
export async function createTestConnectionAndSession(): Promise<{
  connection: AbapConnection;
  session: SessionInfo;
}> {
  // Ensure environment and tokens are loaded (supports auth-broker fallback)
  try {
    await loadTestEnv();
  } catch (error: any) {
    sessionLogger?.warn(
      `[createTestConnectionAndSession] loadTestEnv failed: ${error?.message || String(error)}`,
    );
  }

  try {
    // Try to find .env file path (same logic as loadTestEnv)
    let envFilePath: string | undefined;
    if (process.env.MCP_ENV_PATH) {
      const resolvedPath = path.resolve(process.env.MCP_ENV_PATH);
      if (fs.existsSync(resolvedPath)) {
        envFilePath = resolvedPath;
      }
    }
    if (!envFilePath) {
      const cwdEnvPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(cwdEnvPath)) {
        envFilePath = cwdEnvPath;
      }
    }
    if (!envFilePath) {
      const projectRootEnvPath = path.resolve(__dirname, '../../../../.env');
      if (fs.existsSync(projectRootEnvPath)) {
        envFilePath = projectRootEnvPath;
      }
    }

    // Try to create connection via AuthBroker first (same approach as index.ts)
    let connection: AbapConnection | null = null;
    try {
      connection = await createConnectionViaBroker(undefined, envFilePath);
    } catch (brokerError: any) {
      sessionLogger?.debug(
        `[createTestConnectionAndSession] AuthBroker failed: ${brokerError?.message || String(brokerError)}`,
      );
    }

    // Fallback to getSapConfigFromEnv() if AuthBroker failed
    if (!connection) {
      sessionLogger?.debug(
        '[createTestConnectionAndSession] Using fallback: getSapConfigFromEnv()',
      );
      const config = getSapConfigFromEnv();

      // Only pass connection logger if DEBUG_CONNECTION is set
      const connectionLogger = createConnectionLogger();
      const connectionLoggerWithCsrf = connectionLogger
        ? {
            ...connectionLogger,
            csrfToken: connectionLogger.debug,
          }
        : undefined;

      // Create connection directly (fallback when AuthBroker is not available)
      connection = createAbapConnection(config, connectionLoggerWithCsrf);
    }

    // Log token info from connection (what's actually used in session)
    if (process.env.DEBUG_TESTS === 'true') {
      let connectionConfig: any;
      try {
        // getConfig() is not part of IAbapConnection interface, use type assertion
        connectionConfig = (connection as any).getConfig?.();
      } catch (error: any) {
        sessionLogger?.warn(
          `[getTestSession] Failed to get connection config: ${error?.message}`,
        );
      }

      const connectionConfigJwtToken = connectionConfig?.jwtToken;
      const connectionConfigRefreshToken = connectionConfig?.refreshToken;

      // For refresh token, show only first 10 and last 10 chars (it's shorter than JWT)
      const refreshTokenPreview = connectionConfigRefreshToken
        ? connectionConfigRefreshToken.length > 20
          ? `${connectionConfigRefreshToken.substring(0, 10)}...${connectionConfigRefreshToken.substring(connectionConfigRefreshToken.length - 10)}`
          : `${connectionConfigRefreshToken.substring(0, 10)}...` // If too short, show only first 10
        : 'empty';

      sessionLogger?.debug(
        `[getTestSession] Connection tokens: ${JSON.stringify({
          hasJwtToken: !!connectionConfigJwtToken,
          jwtTokenStart: connectionConfigJwtToken
            ? `${connectionConfigJwtToken.substring(0, 20)}...`
            : 'empty',
          jwtTokenEnd:
            connectionConfigJwtToken && connectionConfigJwtToken.length > 20
              ? `...${connectionConfigJwtToken.substring(connectionConfigJwtToken.length - 20)}`
              : 'empty',
          jwtTokenLength: connectionConfigJwtToken?.length || 0,
          hasRefreshToken: !!connectionConfigRefreshToken,
          refreshTokenPreview: refreshTokenPreview,
          refreshTokenLength: connectionConfigRefreshToken?.length || 0,
          hasUaaUrl: !!connectionConfig?.uaaUrl,
          hasUaaClientId: !!connectionConfig?.uaaClientId,
          hasUaaClientSecret: !!connectionConfig?.uaaClientSecret,
          canRefresh: !!(
            connectionConfigRefreshToken &&
            connectionConfig?.uaaUrl &&
            connectionConfig?.uaaClientId &&
            connectionConfig?.uaaClientSecret
          ),
        })}`,
      );
    }

    // Connect once (same as adt-clients tests - no double connect)
    // connect() is not part of IAbapConnection interface, use type assertion
    const connectionAny = connection as any;
    if (connectionAny.connect) {
      await connectionAny.connect();
    }

    // Generate session ID
    const sessionId = generateSessionId();

    // Get session state directly from connection (same as adt-clients tests)
    // Note: getCookies() and getCsrfToken() exist in concrete classes but not in IAbapConnection interface
    const cookies = connectionAny.getCookies?.() || '';
    const csrfToken = connectionAny.getCsrfToken?.() || '';

    if (!cookies || !csrfToken) {
      throw new Error(
        'Failed to get session state. Connection may not be properly initialized.',
      );
    }

    // Get cookie store from connection if available
    const cookieStore: Record<string, string> = {};
    try {
      // Cookie store is typically internal to connection, so we'll use empty object
      // The cookies string contains all necessary information
    } catch (error) {
      // Ignore - cookie store is optional
    }

    const session: SessionInfo = {
      session_id: sessionId,
      session_state: {
        cookies: cookies || '',
        csrf_token: csrfToken || '',
        cookie_store: cookieStore,
      },
    };

    return {
      connection,
      session,
    };
  } catch (error: any) {
    sessionLogger?.error(
      `[createTestConnectionAndSession] Error caught: ${error?.message || String(error)}`,
    );
    if (process.env.DEBUG_TESTS === 'true' && error?.stack) {
      sessionLogger?.debug(
        `[createTestConnectionAndSession] Stack: ${error.stack}`,
      );
    }
    throw error;
  }
}

/**
 * Get a new session for testing (backward compatibility)
 * Creates a separate connection for each call to avoid shared state
 * @deprecated Consider using createTestConnectionAndSession() for better control
 */
export async function getTestSession(): Promise<SessionInfo> {
  const { session } = await createTestConnectionAndSession();
  return session;
}

/**
 * Update session state from handler response
 */
export function updateSessionFromResponse(
  currentSession: SessionInfo | null,
  handlerResponse: any,
): SessionInfo {
  const { session_id, session_state } = extractSessionState(handlerResponse);

  if (!session_id || !session_state) {
    // If response doesn't have session info, return current session
    if (currentSession) {
      return currentSession;
    }
    throw new Error(
      'Handler response does not contain session information and no current session available',
    );
  }

  return {
    session_id,
    session_state,
  };
}

/**
 * Extract session from Lock response (CRITICAL: must be used for Update/Unlock)
 */
export function extractLockSession(lockResponse: any): SessionInfo {
  const { session_id, session_state } = extractSessionState(lockResponse);

  if (!session_id || !session_state) {
    throw new Error(
      'Lock response does not contain session_id and session_state',
    );
  }

  return {
    session_id,
    session_state,
  };
}
