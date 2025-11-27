/**
 * LockPackage Handler - Lock ABAP Package
 *
 * Uses CrudClient.lockPackage from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection, restoreSessionInConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { AbapConnection } from '@mcp-abap-adt/connection';

export const TOOL_DEFINITION = {
  name: "LockPackageLow",
  description: "[low-level] Lock an ABAP package for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id. Requires super_package.",
  inputSchema: {
    type: "object",
    properties: {
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_TEST_0002)."
      },
      super_package: {
        type: "string",
        description: "Super package (parent package) name (e.g., ZOK_PACKAGE). Required."
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
    required: ["package_name", "super_package"]
  }
} as const;

interface LockPackageArgs {
  package_name: string;
  super_package: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for LockPackage MCP tool
 *
 * Uses CrudClient.lockPackage - low-level single method call
 */
export async function handleLockPackage(args: LockPackageArgs) {
  try {
    const {
      package_name,
      super_package,
      session_id,
      session_state
    } = args as LockPackageArgs;

    // Validation
    if (!package_name || !super_package) {
      return return_error(new Error('package_name and super_package are required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      // CRITICAL: Use restoreSessionInConnection to properly restore session
      // This will set sessionId in connection and enable stateful session mode
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const packageName = package_name.toUpperCase();
    const superPackage = super_package.toUpperCase();

    logger.info(`Starting package lock: ${packageName} in ${superPackage}`);

    try {
      // Lock package
      await client.lockPackage({ packageName, superPackage });
      const lockHandle = client.getLockHandle();

      if (!lockHandle) {
        throw new Error(`Lock did not return a lock handle for package ${packageName}`);
      }

      // Get updated session state after lock
      const updatedSessionState = connection.getSessionState();

      // Get actual session ID from connection (may be different from input if new session was created)
      // Connection.getSessionId() returns the current session ID used by the connection
      const actualSessionId = connection.getSessionId() || session_id || null;

      logger.info(`✅ LockPackage completed: ${packageName}`);
      logger.info(`   Lock handle: ${lockHandle.substring(0, 20)}...`);

      return return_response({
        data: JSON.stringify({
          success: true,
          package_name: packageName,
          super_package: superPackage,
          session_id: actualSessionId,
          lock_handle: lockHandle,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Package ${packageName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error locking package ${packageName}:`, error);

      // Parse error message
      let errorMessage = `Failed to lock package: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Package ${packageName} not found.`;
      } else if (error.response?.status === 409) {
        errorMessage = `Package ${packageName} is already locked by another user.`;
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
