/**
 * Session management helpers for low-level handler integration tests
 *
 * A connection is built the way the server builds one:
 * - the test config's destination: its settings and its provider, from the
 *   factory (`getTestDestination`)
 * - fallback: the .env config (`getSapConfigFromEnv`) and the credential it
 *   describes (`credentialFromSapConfig`)
 * - Call connect() once
 * - Extract session state directly from connection
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { credentialFromSapConfig } from '../../../lib/credentialSources';
import { generateSessionId } from '../../../lib/sessionUtils';
import { resolveSystemContext } from '../../../lib/systemContext';
import { createConnectionLogger, getTestDestination } from './authHelpers';
import {
  getSapConfigFromEnv,
  loadTestConfig,
  loadTestEnv,
} from './configHelpers';
import { createTestLogger } from './loggerHelpers';
import { trackConnection } from './openConnections';
import { extractSessionState } from './testHelpers';

/**
 * The connection logger, with the `csrfToken` channel the connection expects.
 *
 * **Not a spread.** `createConnectionLogger()` answers a class instance, and
 * spreading one copies its own enumerable fields — `logLevel` and nothing
 * else — while `debug`, `info`, `warn` and `error` live on the prototype and
 * are left behind. The result was an object that looked like a logger and had
 * no methods, so the moment `DEBUG_CONNECTION` was set the connection died on
 * `this.logger?.debug is not a function`: the one switch that exists to
 * diagnose a connection could not be turned on. Found during on-premise
 * testing of #220, reported in #222.
 *
 * `Object.assign` adds the channel to the instance itself, so the prototype
 * chain stays. `debug` is bound because it is handed on as a bare function
 * reference and would otherwise lose its receiver.
 */
function withCsrfChannel(logger: ILogger | undefined): ILogger | undefined {
  return logger
    ? Object.assign(logger, { csrfToken: logger.debug.bind(logger) })
    : undefined;
}

const sessionLogger = createTestLogger('connection');

export interface SessionInfo {
  session_id: string;
  session_state: {
    cookies: string;
    csrf_token: string;
    cookie_store: Record<string, string>;
  };
}

/**
 * A connection to the test config's destination: its settings and its
 * provider from the factory, one provider for the whole process.
 * `null` when the config names no destination or the destination fails.
 */
async function createConnectionViaBroker(): Promise<IAbapConnection | null> {
  try {
    const target = await getTestDestination();
    if (!target) return null;
    sessionLogger?.info('Using connection from auth broker', {
      destination: target.destination,
      url: target.settings.url,
      authType: target.settings.authType,
    });
    // Only pass connection logger if DEBUG_CONNECTION is set
    const connectionLoggerWithCsrf = withCsrfChannel(createConnectionLogger());
    return trackConnection(
      createAbapConnection(
        target.settings,
        target.credential,
        connectionLoggerWithCsrf,
      ),
    );
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
  connection: IAbapConnection;
  session: SessionInfo;
  authType?: string;
  connectionSource?: 'auth_broker' | 'env' | 'unknown';
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
    // Check if environment.env is explicitly configured — skip auth broker
    const hasExplicitEnv = !!loadTestConfig()?.environment?.env;

    let connection: IAbapConnection | null = null;
    let connectionSource: 'auth_broker' | 'env' | 'unknown' = 'unknown';

    // Try AuthBroker only when no explicit env file is configured
    if (!hasExplicitEnv) {
      try {
        connection = await createConnectionViaBroker();
        if (connection) {
          connectionSource = 'auth_broker';
        }
      } catch (brokerError: any) {
        sessionLogger?.debug(
          `[createTestConnectionAndSession] AuthBroker failed: ${brokerError?.message || String(brokerError)}`,
        );
      }
    }

    // Fallback to getSapConfigFromEnv() if AuthBroker failed
    if (!connection) {
      sessionLogger?.debug(
        '[createTestConnectionAndSession] Using fallback: getSapConfigFromEnv()',
      );
      const config = getSapConfigFromEnv();

      // Only pass connection logger if DEBUG_CONNECTION is set
      const connectionLogger = createConnectionLogger();
      const connectionLoggerWithCsrf = withCsrfChannel(connectionLogger);

      // Create connection directly (fallback when AuthBroker is not available)
      connection = trackConnection(
        createAbapConnection(
          config,
          credentialFromSapConfig(config),
          connectionLoggerWithCsrf,
        ),
      );
      connectionSource = 'env';
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

    // Resolve system context (legacy detection) so createAdtClient() picks the correct client
    await resolveSystemContext(connection);

    // Generate session ID
    const sessionId = generateSessionId();

    // Get session state directly from connection (same as adt-clients tests)
    // Note: getCookies() and getCsrfToken() exist in concrete classes but not in IAbapConnection interface
    const cookies = connectionAny.getCookies?.() || '';
    const csrfToken = connectionAny.getCsrfToken?.() || '';

    if (!cookies && !csrfToken) {
      const isRfc = process.env.SAP_CONNECTION_TYPE?.toLowerCase() === 'rfc';
      if (!isRfc) {
        throw new Error(
          'Failed to get session state. Connection may not be properly initialized.',
        );
      }
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

    let authType: string | undefined;
    try {
      authType = (connection as any)?.getConfig?.()?.authType;
    } catch {
      authType = undefined;
    }

    return {
      connection,
      session,
      authType,
      connectionSource,
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
