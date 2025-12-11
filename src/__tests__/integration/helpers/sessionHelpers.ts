/**
 * Session management helpers for low-level handler integration tests
 *
 * Uses the same approach as adt-clients tests:
 * - Create connection directly (not via getManagedConnection)
 * - Call connect() once
 * - Extract session state directly from connection
 */

import { extractSessionState } from './testHelpers';
import { loadTestEnv, getSapConfigFromEnv } from './configHelpers';
import { AbapConnection, createAbapConnection } from '@mcp-abap-adt/connection';
import { generateSessionId } from '../../../lib/sessionUtils';
import { createTestLogger } from './loggerHelpers';

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
 * Create a separate connection and session for testing
 * Creates a new connection for each test to avoid shared state
 */
export async function createTestConnectionAndSession(): Promise<{
  connection: AbapConnection;
  session: SessionInfo;
}> {
  // Ensure environment and tokens are loaded (supports auth-broker fallback)
  try {
    await loadTestEnv();
  } catch (error: any) {
    sessionLogger.warn(`[createTestConnectionAndSession] loadTestEnv failed: ${error?.message || String(error)}`);
  }

  try {
    // Get configuration from environment variables (auth-broker or .env)
    const config = getSapConfigFromEnv();

    // Create logger for connection (only logs when DEBUG_CONNECTORS is enabled)
    const connectionLogger = {
      debug: sessionLogger.debug,
      info: sessionLogger.info,
      warn: sessionLogger.warn,
      error: sessionLogger.error,
      csrfToken: sessionLogger.debug,
    };

    // Create connection directly (same as in adt-clients tests)
    const connection = createAbapConnection(config, connectionLogger);

    // Log token info from connection (what's actually used in session)
    if (process.env.DEBUG_TESTS === 'true') {
      let connectionConfig: any = undefined;
      try {
        connectionConfig = connection.getConfig();
      } catch (error: any) {
        sessionLogger.warn(`[getTestSession] Failed to get connection config: ${error?.message}`);
      }

      const connectionConfigJwtToken = connectionConfig?.jwtToken;
      const connectionConfigRefreshToken = connectionConfig?.refreshToken;

      // For refresh token, show only first 10 and last 10 chars (it's shorter than JWT)
      const refreshTokenPreview = connectionConfigRefreshToken
        ? connectionConfigRefreshToken.length > 20
          ? `${connectionConfigRefreshToken.substring(0, 10)}...${connectionConfigRefreshToken.substring(connectionConfigRefreshToken.length - 10)}`
          : connectionConfigRefreshToken.substring(0, 10) + '...' // If too short, show only first 10
        : 'empty';

      sessionLogger.debug(
        `[getTestSession] Connection tokens: ${JSON.stringify({
          hasJwtToken: !!connectionConfigJwtToken,
          jwtTokenStart: connectionConfigJwtToken ? `${connectionConfigJwtToken.substring(0, 20)}...` : 'empty',
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
        })}`
      );
    }

    // Connect once (same as adt-clients tests - no double connect)
    await connection.connect();

    // Generate session ID
    const sessionId = generateSessionId();

    // Get session state directly from connection (same as adt-clients tests)
    const sessionState = connection.getSessionState();

    if (!sessionState) {
      throw new Error('Failed to get session state. Connection may not be properly initialized.');
    }

    const session: SessionInfo = {
      session_id: sessionId,
      session_state: {
        cookies: sessionState.cookies || '',
        csrf_token: sessionState.csrfToken || '',
        cookie_store: sessionState.cookieStore || {}
      }
    };

    return {
      connection,
      session
    };
  } catch (error: any) {
    sessionLogger.error(
      `[createTestConnectionAndSession] Error caught: ${error?.message || String(error)}`
    );
    if (process.env.DEBUG_TESTS === 'true' && error?.stack) {
      sessionLogger.debug(`[createTestConnectionAndSession] Stack: ${error.stack}`);
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
  handlerResponse: any
): SessionInfo {
  const { session_id, session_state } = extractSessionState(handlerResponse);

  if (!session_id || !session_state) {
    // If response doesn't have session info, return current session
    if (currentSession) {
      return currentSession;
    }
    throw new Error('Handler response does not contain session information and no current session available');
  }

  return {
    session_id,
    session_state
  };
}

/**
 * Extract session from Lock response (CRITICAL: must be used for Update/Unlock)
 */
export function extractLockSession(lockResponse: any): SessionInfo {
  const { session_id, session_state } = extractSessionState(lockResponse);

  if (!session_id || !session_state) {
    throw new Error('Lock response does not contain session_id and session_state');
  }

  return {
    session_id,
    session_state
  };
}
