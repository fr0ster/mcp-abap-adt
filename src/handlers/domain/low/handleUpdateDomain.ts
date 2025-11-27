/**
 * UpdateDomain Handler - Update ABAP Domain Properties
 *
 * Uses CrudClient.updateDomain from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection, restoreSessionInConnection } from '../../../lib/utils';
import { handlerLogger } from '../../../lib/logger';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UpdateDomainLow",
  description: "[low-level] Update properties of an existing ABAP domain. Requires lock handle from LockObject. - use UpdateDomain (high-level) for full workflow with lock/unlock/activate.",
  inputSchema: {
    type: "object",
    properties: {
      domain_name: {
        type: "string",
        description: "Domain name (e.g., ZOK_D_TEST_0001). Domain must already exist."
      },
      properties: {
        type: "object",
        description: "Domain properties object. Can include: description, datatype, length, decimals, conversion_exit, lowercase, sign_exists, value_table, fixed_values, etc."
      },
      lock_handle: {
        type: "string",
        description: "Lock handle from LockObject. Required for update operation."
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
    required: ["domain_name", "properties", "lock_handle"]
  }
} as const;

interface UpdateDomainArgs {
  domain_name: string;
  properties: Record<string, any>;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UpdateDomain MCP tool
 *
 * Uses CrudClient.updateDomain - low-level single method call
 */
export async function handleUpdateDomain(args: UpdateDomainArgs) {
  try {
    const {
      domain_name,
      properties,
      lock_handle,
      session_id,
      session_state
    } = args as UpdateDomainArgs;

    // Validation
    if (!domain_name || !properties || !lock_handle) {
      return return_error(new Error('domain_name, properties, and lock_handle are required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    const domainName = domain_name.toUpperCase();

    handlerLogger.info('UpdateDomain', 'start', `Starting update for ${domainName}`, {
      lock_handle: lock_handle,
      session_id: session_id || 'none',
      has_session_state: !!session_state,
      session_state_cookies: session_state?.cookies?.substring(0, 50) + '...' || 'none',
      session_state_csrf: session_state?.csrf_token?.substring(0, 20) + '...' || 'none',
      properties_keys: Object.keys(properties),
      properties_package_name: properties.package_name || properties.packageName || 'missing'
    });

    // Restore session state if provided
    if (session_id && session_state) {
      handlerLogger.info('UpdateDomain', 'restore_session', 'Restoring session state from Lock', {
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
      handlerLogger.info('UpdateDomain', 'session_restored', 'Session state restored successfully', {
        session_id,
        connection_session_id: connection.getSessionId(),
        restored_cookies_length: restoredState?.cookies?.length || 0,
        restored_csrf_token_length: restoredState?.csrfToken?.length || 0,
        restored_cookie_store_size: restoredState?.cookieStore ? Object.keys(restoredState.cookieStore).length : 0,
        cookies_match: restoredState?.cookies === session_state.cookies,
        csrf_token_match: restoredState?.csrfToken === session_state.csrf_token
      });
    } else {
      handlerLogger.warn('UpdateDomain', 'no_session', 'No session provided, creating new connection (may fail if domain is locked)');
      // Ensure connection is established
      await connection.connect();
    }

    logger.info(`Starting domain update: ${domainName}`);

    try {
      // Update domain with properties
      handlerLogger.debug('UpdateDomain', 'update', `Calling client.updateDomain({ domainName: ${domainName}, ...properties }, ${lock_handle})`, {
        properties: properties
      });
      await client.updateDomain({
        domainName,
        packageName: properties.package_name || properties.packageName,
        description: properties.description || ''
      }, lock_handle);
      const updateResult = client.getUpdateResult();

      if (!updateResult) {
        throw new Error(`Update did not return a response for domain ${domainName}`);
      }

      // Get updated session state after update
      const updatedSessionState = connection.getSessionState();

      handlerLogger.info('UpdateDomain', 'success', `Update completed for ${domainName}`, {
        updated_session_state: {
          has_cookies: !!updatedSessionState?.cookies,
          cookies_length: updatedSessionState?.cookies?.length || 0,
          has_csrf_token: !!updatedSessionState?.csrfToken,
          csrf_token_length: updatedSessionState?.csrfToken?.length || 0,
          cookie_store_size: updatedSessionState?.cookieStore ? Object.keys(updatedSessionState.cookieStore).length : 0
        }
      });

      logger.info(`✅ UpdateDomain completed: ${domainName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          domain_name: domainName,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Domain ${domainName} updated successfully. Remember to unlock using UnlockObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error updating domain ${domainName}:`, error);

      // Parse error message
      let errorMessage = `Failed to update domain: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Domain ${domainName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Domain ${domainName} is locked by another user or lock handle is invalid.`;
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

