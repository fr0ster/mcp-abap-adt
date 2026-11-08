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

import { randomUUID } from 'node:crypto';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { credentialFromSapConfig } from '../../../lib/credentialSources';
import { createConnectionLogger, getTestDestination } from './authHelpers';
import {
  getSapConfigFromEnv,
  loadTestConfig,
  loadTestEnv,
} from './configHelpers';
import { createTestLogger } from './loggerHelpers';
import { trackConnection } from './openConnections';
import { primeSystemContext } from './primeSystemContext';
import {
  type GuardedConnection,
  guardedTestConnection,
  refuseAfterMarker,
} from './refusalGuard';
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
    /** The connection's `sessionCookies()`; empty over RFC. A secret. */
    cookies: string;
  };
}

/**
 * A connection to the test config's destination: its settings and its
 * provider from the factory, one provider for the whole process.
 * `null` when the config names no destination or the destination fails.
 */
async function createConnectionViaBroker(): Promise<GuardedConnection | null> {
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
      guardedTestConnection(target.settings, target.credential, {
        logger: connectionLoggerWithCsrf,
      }),
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
  // Nothing is read or sent once a credential was refused in this run.
  refuseAfterMarker('a test connection');
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

    let connection: GuardedConnection | null = null;
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
        guardedTestConnection(config, credentialFromSapConfig(config), {
          logger: connectionLoggerWithCsrf,
        }),
      );
      connectionSource = 'env';
    }

    // Which credentials the connection carries — presence and length only,
    // never a character of a token or secret.
    if (process.env.DEBUG_TESTS === 'true') {
      const connectionConfig = connection.getConfig();
      sessionLogger?.debug(
        `[getTestSession] Connection tokens: ${JSON.stringify({
          hasJwtToken: !!connectionConfig.jwtToken,
          jwtTokenLength: connectionConfig.jwtToken?.length ?? 0,
          hasRefreshToken: !!connectionConfig.refreshToken,
          refreshTokenLength: connectionConfig.refreshToken?.length ?? 0,
          hasUaaUrl: !!connectionConfig.uaaUrl,
          hasUaaClientId: !!connectionConfig.uaaClientId,
          hasUaaClientSecret: !!connectionConfig.uaaClientSecret,
        })}`,
      );
    }

    // Connect once (same as adt-clients tests - no double connect)
    await connection.connect();

    // Resolve system context (legacy detection) so createAdtClient() picks the correct client
    await primeSystemContext(connection);

    // Generate session ID
    const sessionId = randomUUID().replace(/-/g, '');

    // The session the connection holds, as the guarded connection declares
    // it: `sessionCookies()`. The concrete class's `getCookies()` /
    // `getCsrfToken()` are protected and not on the guard, so reading them
    // found nothing and refused every HTTP connection. `null` before a
    // session and over RFC, whose session no cookie names.
    const config = connection.getConfig();
    const cookies = connection.sessionCookies();
    if (cookies === null && config.connectionType !== 'rfc') {
      throw new Error(
        'Failed to get session state. Connection may not be properly initialized.',
      );
    }

    const session: SessionInfo = {
      session_id: sessionId,
      session_state: { cookies: cookies ?? '' },
    };
    const authType: string = config.authType;

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
