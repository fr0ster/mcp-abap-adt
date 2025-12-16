/**
 * UnlockTable Handler - Unlock ABAP Table
 *
 * Uses CrudClient.unlockTable from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { return_error, return_response, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "UnlockTableLow",
  description: "[low-level] Unlock an ABAP table after modification. Must use the same session_id and lock_handle from LockTable operation.",
  inputSchema: {
    type: "object",
    properties: {
      table_name: {
        type: "string",
        description: "Table name (e.g., Z_MY_PROGRAM)."
      },
      lock_handle: {
        type: "string",
        description: "Lock handle from LockTable operation."
      },
      session_id: {
        type: "string",
        description: "Session ID from LockTable operation. Must be the same as used in LockTable."
      },
      session_state: {
        type: "object",
        description: "Session state from LockTable (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["table_name", "lock_handle", "session_id"]
  }
} as const;

interface UnlockTableArgs {
  table_name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UnlockTable MCP tool
 *
 * Uses CrudClient.unlockTable - low-level single method call
 */
export async function handleUnlockTable(context: HandlerContext, args: UnlockTableArgs) {
  const { connection, logger } = context;
  try {
    const { table_name, lock_handle, session_id, session_state } = args as UnlockTableArgs;

    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const tableName = table_name.toUpperCase();

    logger?.info(`Starting table unlock: ${tableName} (session: ${session_id.substring(0, 8)}...)`);

    try {
      // Unlock table
      await client.unlockTable({ tableName: tableName }, lock_handle);
      const unlockResult = client.getUnlockResult();

      if (!unlockResult) {
        throw new Error(`Unlock did not return a response for table ${tableName}`);
      }

      // Get updated session state after unlock


      logger?.info(`✅ UnlockTable completed: ${tableName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          table_name: tableName,
          session_id: session_id,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `Table ${tableName} unlocked successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger?.error(`Error unlocking table ${tableName}:`, error);

      // Parse error message
      let errorMessage = `Failed to unlock table: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Table ${tableName} not found.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Invalid lock handle or session. Make sure you're using the same session_id and lock_handle from LockTable.`;
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
