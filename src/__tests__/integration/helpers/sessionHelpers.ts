/**
 * Session management helpers for low-level handler integration tests
 *
 * Uses the same approach as adt-clients tests:
 * - Create connection directly (not via getManagedConnection)
 * - Call connect() once
 * - Extract session state directly from connection
 */

import { extractSessionState } from './testHelpers';
import { AbapConnection, createAbapConnection } from '@mcp-abap-adt/connection';
import { getConfig } from '../../../index';
import { generateSessionId } from '../../../lib/sessionUtils';

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
  try {
    // Get configuration from environment variables
    const config = getConfig();

    // Create logger for connection (only logs when DEBUG_CONNECTORS is enabled)
    const connectionLogger = {
      debug: process.env.DEBUG_CONNECTORS === 'true' ? console.log : () => {},
      info: process.env.DEBUG_CONNECTORS === 'true' ? console.log : () => {},
      warn: process.env.DEBUG_CONNECTORS === 'true' ? console.warn : () => {},
      error: process.env.DEBUG_CONNECTORS === 'true' ? console.error : () => {},
      csrfToken: process.env.DEBUG_CONNECTORS === 'true' ? console.log : () => {}
    };

    // Create connection directly (same as in adt-clients tests)
    const connection = createAbapConnection(config, connectionLogger);

    // Log token info from connection (what's actually used in session)
    if (process.env.DEBUG_TESTS === 'true') {
      let connectionConfig: any = undefined;
      try {
        connectionConfig = connection.getConfig();
      } catch (error: any) {
        console.warn('[getTestSession] Failed to get connection config:', error?.message);
      }

      const connectionConfigJwtToken = connectionConfig?.jwtToken;
      const connectionConfigRefreshToken = connectionConfig?.refreshToken;

      // For refresh token, show only first 10 and last 10 chars (it's shorter than JWT)
      const refreshTokenPreview = connectionConfigRefreshToken
        ? connectionConfigRefreshToken.length > 20
          ? `${connectionConfigRefreshToken.substring(0, 10)}...${connectionConfigRefreshToken.substring(connectionConfigRefreshToken.length - 10)}`
          : connectionConfigRefreshToken.substring(0, 10) + '...' // If too short, show only first 10
        : 'empty';

      console.log('[getTestSession] Connection tokens:', {
        hasJwtToken: !!connectionConfigJwtToken,
        jwtTokenStart: connectionConfigJwtToken ? `${connectionConfigJwtToken.substring(0, 20)}...` : 'empty',
        jwtTokenEnd: connectionConfigJwtToken && connectionConfigJwtToken.length > 20 ? `...${connectionConfigJwtToken.substring(connectionConfigJwtToken.length - 20)}` : 'empty',
        jwtTokenLength: connectionConfigJwtToken?.length || 0,
        hasRefreshToken: !!connectionConfigRefreshToken,
        refreshTokenPreview: refreshTokenPreview,
        refreshTokenLength: connectionConfigRefreshToken?.length || 0,
        // Also check UAA config
        hasUaaUrl: !!(connectionConfig?.uaaUrl),
        hasUaaClientId: !!(connectionConfig?.uaaClientId),
        hasUaaClientSecret: !!(connectionConfig?.uaaClientSecret),
        canRefresh: !!(connectionConfigRefreshToken && connectionConfig?.uaaUrl && connectionConfig?.uaaClientId && connectionConfig?.uaaClientSecret)
      });
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
    if (process.env.DEBUG_TESTS === 'true') {
      console.error('[createTestConnectionAndSession] Error caught:', {
        message: error?.message,
        stack: error?.stack,
        error: error
      });
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

