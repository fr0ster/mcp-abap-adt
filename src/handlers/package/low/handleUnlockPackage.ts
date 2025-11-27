/**
 * UnlockPackage Handler - Unlock ABAP Package
 *
 * Uses CrudClient.unlockPackage from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection, restoreSessionInConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UnlockPackageLow",
  description: "[low-level] Unlock an ABAP package after modification. Requires lock handle from LockObject and superPackage. - must use the same session_id and lock_handle from LockObject.",
  inputSchema: {
    type: "object",
    properties: {
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_TEST_0002). Package must already exist."
      },
      super_package: {
        type: "string",
        description: "Super package (parent package) name. Required for package operations."
      },
      lock_handle: {
        type: "string",
        description: "Lock handle from LockObject operation"
      },
      session_id: {
        type: "string",
        description: "Session ID from LockObject operation. Must be the same as used in LockObject."
      },
      session_state: {
        type: "object",
        description: "Session state from LockObject (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["package_name", "super_package", "lock_handle", "session_id"]
  }
} as const;

interface UnlockPackageArgs {
  package_name: string;
  super_package: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UnlockPackage MCP tool
 *
 * Uses CrudClient.unlockPackage - low-level single method call
 */
export async function handleUnlockPackage(args: UnlockPackageArgs) {
  try {
    const {
      package_name,
      super_package,
      lock_handle,
      session_id,
      session_state
    } = args as UnlockPackageArgs;

    // Validation
    if (!package_name || !super_package || !lock_handle || !session_id) {
      return return_error(new Error('package_name, super_package, lock_handle, and session_id are required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_state) {
      // CRITICAL: Use restoreSessionInConnection to properly restore session
      // This will set sessionId in connection and enable stateful session mode
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const packageName = package_name.toUpperCase();
    const superPackage = super_package.toUpperCase();

    logger.info(`Starting package unlock: ${packageName} (session: ${session_id.substring(0, 8)}...)`);

    try {
      // Get builder instance and set lockHandle in state before unlock
      // This is needed because PackageBuilder.unlock() checks this.state.lockHandle,
      // but CrudClient.unlockPackage() only sets (builder as any).lockHandle
      const builder = (client as any).getPackageBuilder({ packageName, superPackage });
      if (builder) {
        // Set lockHandle in state so unlock() can find it
        (builder as any).state.lockHandle = lock_handle;
      }

      // Unlock package using CrudClient (with proper session state restored)
      await client.unlockPackage({ packageName, superPackage }, lock_handle);
      const unlockResult = client.getUnlockResult();

      if (!unlockResult) {
        throw new Error(`Unlock did not return a response for package ${packageName}`);
      }

      // Get updated session state after unlock
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ UnlockPackage completed: ${packageName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          package_name: packageName,
          super_package: superPackage,
          session_id: session_id,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Package ${packageName} unlocked successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error unlocking package ${packageName}:`, error);

      // Parse error message
      let errorMessage = `Failed to unlock package: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Package ${packageName} not found.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Invalid lock handle or session. Make sure you're using the same session_id and lock_handle from LockObject.`;
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

