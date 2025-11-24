/**
 * UpdatePackage Handler - Update ABAP Package Description
 *
 * Uses CrudClient.updatePackage from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UpdatePackageLow",
  description: "[low-level] Update description of an existing ABAP package. Requires lock handle from LockObject and superPackage. - use UpdatePackageSource for full workflow with lock/unlock.",
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
      updated_description: {
        type: "string",
        description: "New description for the package."
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
    required: ["package_name", "super_package", "updated_description", "lock_handle"]
  }
} as const;

interface UpdatePackageArgs {
  package_name: string;
  super_package: string;
  updated_description: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UpdatePackage MCP tool
 *
 * Uses CrudClient.updatePackage - low-level single method call
 */
export async function handleUpdatePackage(args: any) {
  try {
    const {
      package_name,
      super_package,
      updated_description,
      lock_handle,
      session_id,
      session_state
    } = args as UpdatePackageArgs;

    // Validation
    if (!package_name || !super_package || !updated_description || !lock_handle) {
      return return_error(new Error('package_name, super_package, updated_description, and lock_handle are required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      connection.setSessionState({
        cookies: session_state.cookies || null,
        csrfToken: session_state.csrf_token || null,
        cookieStore: session_state.cookie_store || {}
      });
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const packageName = package_name.toUpperCase();
    const superPackage = super_package.toUpperCase();

    logger.info(`Starting package update: ${packageName}`);

    try {
      // Update package description
      await client.updatePackage(packageName, superPackage, updated_description, lock_handle);
      const updateResult = client.getUpdateResult();

      if (!updateResult) {
        throw new Error(`Update did not return a response for package ${packageName}`);
      }

      // Get updated session state after update
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ UpdatePackage completed: ${packageName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          package_name: packageName,
          super_package: superPackage,
          updated_description,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Package ${packageName} updated successfully. Remember to unlock using UnlockObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error updating package ${packageName}:`, error);

      // Parse error message
      let errorMessage = `Failed to update package: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Package ${packageName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Package ${packageName} is locked by another user or lock handle is invalid.`;
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

