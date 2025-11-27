/**
 * LockDomain Handler - Lock ABAP Domain
 *
 * Uses CrudClient.lockDomain from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection, restoreSessionInConnection } from '../../../lib/utils';
import { handlerLogger } from '../../../lib/logger';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "LockDomainLow",
  description: "[low-level] Lock an ABAP domain for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.",
  inputSchema: {
    type: "object",
    properties: {
      domain_name: {
        type: "string",
        description: "Domain name (e.g., Z_MY_PROGRAM)."
      },
      session_id: {
        type: "string",
        description: "Session ID from GetSession. If not provided, a new session will be created."
      },
      session_state: {
        type: "object",
        description: "Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["domain_name"]
  }
} as const;

interface LockDomainArgs {
  domain_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for LockDomain MCP tool
 *
 * Uses CrudClient.lockDomain - low-level single method call
 */
export async function handleLockDomain(args: LockDomainArgs) {
  try {
    const {
      domain_name,
      session_id,
      session_state
    } = args as LockDomainArgs;

    // Validation
    if (!domain_name) {
      return return_error(new Error('domain_name is required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    const domainName = domain_name.toUpperCase();

    handlerLogger.info('LockDomain', 'start', `Starting lock for ${domainName}`, {
      session_id: session_id || 'none',
      has_session_state: !!session_state,
      session_state_cookies: session_state?.cookies?.substring(0, 50) + '...' || 'none',
      session_state_csrf: session_state?.csrf_token?.substring(0, 20) + '...' || 'none',
      session_state_cookie_store_keys: session_state?.cookie_store ? Object.keys(session_state.cookie_store) : []
    });

    // Restore session state if provided
    if (session_id && session_state) {
      handlerLogger.info('LockDomain', 'restore_session', 'Restoring session state', {
        session_id,
        cookies_length: session_state.cookies?.length || 0,
        csrf_token_length: session_state.csrf_token?.length || 0,
        cookie_store_size: session_state.cookie_store ? Object.keys(session_state.cookie_store).length : 0
      });

      // CRITICAL: Use restoreSessionInConnection to properly restore session
      // This will set sessionId in connection and enable stateful session mode
      await restoreSessionInConnection(connection, session_id, session_state);

      // Verify session was restored
      const restoredState = connection.getSessionState();
      handlerLogger.info('LockDomain', 'session_restored', 'Session state restored successfully', {
        session_id,
        connection_session_id: connection.getSessionId(),
        restored_cookies_length: restoredState?.cookies?.length || 0,
        restored_csrf_token_length: restoredState?.csrfToken?.length || 0,
        restored_cookie_store_size: restoredState?.cookieStore ? Object.keys(restoredState.cookieStore).length : 0,
        cookies_match: restoredState?.cookies === session_state.cookies,
        csrf_token_match: restoredState?.csrfToken === session_state.csrf_token
      });
    } else {
      handlerLogger.info('LockDomain', 'connect', 'No session provided, creating new connection');
      // Ensure connection is established
      await connection.connect();
    }

    logger.info(`Starting domain lock: ${domainName}`);

    try {
      // Lock domain
      handlerLogger.debug('LockDomain', 'lock', `Calling client.lockDomain({ domainName: ${domainName} })`);
      await client.lockDomain({ domainName });
      const lockHandle = client.getLockHandle();

      if (!lockHandle) {
        throw new Error(`Lock did not return a lock handle for domain ${domainName}`);
      }

      // Get updated session state after lock
      const updatedSessionState = connection.getSessionState();

      // Get actual session ID from connection (may be different from input if new session was created)
      const actualSessionId = connection.getSessionId() || session_id || null;

      handlerLogger.info('LockDomain', 'success', `Lock completed for ${domainName}`, {
        lock_handle: lockHandle,
        lock_handle_length: lockHandle.length,
        input_session_id: session_id || 'none',
        actual_session_id: actualSessionId || 'none',
        updated_session_state: {
          has_cookies: !!updatedSessionState?.cookies,
          cookies_length: updatedSessionState?.cookies?.length || 0,
          has_csrf_token: !!updatedSessionState?.csrfToken,
          csrf_token_length: updatedSessionState?.csrfToken?.length || 0,
          cookie_store_size: updatedSessionState?.cookieStore ? Object.keys(updatedSessionState.cookieStore).length : 0
        }
      });

      logger.info(`✅ LockDomain completed: ${domainName}`);
      logger.info(`   Lock handle: ${lockHandle.substring(0, 20)}...`);

      return return_response({
        data: JSON.stringify({
          success: true,
          domain_name: domainName,
          session_id: actualSessionId,
          lock_handle: lockHandle,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Domain ${domainName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error locking domain ${domainName}:`, error);

      // Parse error message
      let errorMessage = `Failed to lock domain: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Domain ${domainName} not found.`;
      } else if (error.response?.status === 409) {
        errorMessage = `Domain ${domainName} is already locked by another user.`;
      } else if (error.response?.data && typeof error.response.data === 'string') {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_'
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg = errorData['exc:exception']?.message?.['#text'] || errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }

  } catch (error: any) {
    return return_error(error);
  }
}

