/**
 * UpdateStructure Handler - Update ABAP Structure DDL Source
 *
 * Uses CrudClient.updateStructure from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UpdateStructure",
  description: "[low-level] Update DDL source code of an existing ABAP structure. Requires lock handle from LockObject. - use UpdateStructureSource for full workflow with lock/unlock.",
  inputSchema: {
    type: "object",
    properties: {
      structure_name: {
        type: "string",
        description: "Structure name (e.g., ZZ_S_TEST_001). Structure must already exist."
      },
      ddl_code: {
        type: "string",
        description: "Complete DDL source code for the structure definition."
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
    required: ["structure_name", "ddl_code", "lock_handle"]
  }
} as const;

interface UpdateStructureArgs {
  structure_name: string;
  ddl_code: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UpdateStructure MCP tool
 *
 * Uses CrudClient.updateStructure - low-level single method call
 */
export async function handleUpdateStructure(args: any) {
  try {
    const {
      structure_name,
      ddl_code,
      lock_handle,
      session_id,
      session_state
    } = args as UpdateStructureArgs;

    // Validation
    if (!structure_name || !ddl_code || !lock_handle) {
      return return_error(new Error('structure_name, ddl_code, and lock_handle are required'));
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

    const structureName = structure_name.toUpperCase();

    logger.info(`Starting structure update: ${structureName}`);

    try {
      // Update structure with DDL code
      await client.updateStructure(structureName, ddl_code, lock_handle);
      const updateResult = client.getUpdateResult();

      if (!updateResult) {
        throw new Error(`Update did not return a response for structure ${structureName}`);
      }

      // Get updated session state after update
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ UpdateStructure completed: ${structureName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          structure_name: structureName,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Structure ${structureName} updated successfully. Remember to unlock using UnlockObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error updating structure ${structureName}:`, error);

      // Parse error message
      let errorMessage = `Failed to update structure: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Structure ${structureName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Structure ${structureName} is locked by another user or lock handle is invalid.`;
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

