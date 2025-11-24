/**
 * LockStructure Handler - Lock ABAP Structure
 *
 * Uses CrudClient.lockStructure from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "LockStructureLow",
  description: "[low-level] Lock an ABAP structure for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.",
  inputSchema: {
    type: "object",
    properties: {
      structure_name: {
        type: "string",
        description: "Structure name (e.g., Z_MY_PROGRAM)."
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
    required: ["structure_name"]
  }
} as const;

interface LockStructureArgs {
  structure_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for LockStructure MCP tool
 *
 * Uses CrudClient.lockStructure - low-level single method call
 */
export async function handleLockStructure(args: any) {
  try {
    const {
      structure_name,
      session_id,
      session_state
    } = args as LockStructureArgs;

    // Validation
    if (!structure_name) {
      return return_error(new Error('structure_name is required'));
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

    logger.info(`Starting structure lock: ${structureName}`);

    try {
      // Lock structure
      await client.lockStructure(structureName);
      const lockHandle = client.getLockHandle();

      if (!lockHandle) {
        throw new Error(`Lock did not return a lock handle for structure ${structureName}`);
      }

      // Get updated session state after lock
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ LockStructure completed: ${structureName}`);
      logger.info(`   Lock handle: ${lockHandle.substring(0, 20)}...`);

      return return_response({
        data: JSON.stringify({
          success: true,
          structure_name: structureName,
          session_id: session_id || null,
          lock_handle: lockHandle,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Structure ${structureName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error locking structure ${structureName}:`, error);

      // Parse error message
      let errorMessage = `Failed to lock structure: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Structure ${structureName} not found.`;
      } else if (error.response?.status === 409) {
        errorMessage = `Structure ${structureName} is already locked by another user.`;
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

