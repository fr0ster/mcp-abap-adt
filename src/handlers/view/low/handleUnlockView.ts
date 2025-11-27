/**
 * UnlockView Handler - Unlock ABAP View
 *
 * Uses CrudClient.unlockView from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UnlockViewLow",
  description: "[low-level] Unlock an ABAP view after modification. Must use the same session_id and lock_handle from LockView operation.",
  inputSchema: {
    type: "object",
    properties: {
      view_name: {
        type: "string",
        description: "View name (e.g., Z_MY_PROGRAM)."
      },
      lock_handle: {
        type: "string",
        description: "Lock handle from LockView operation."
      },
      session_id: {
        type: "string",
        description: "Session ID from LockView operation. Must be the same as used in LockView."
      },
      session_state: {
        type: "object",
        description: "Session state from LockView (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["view_name", "lock_handle", "session_id"]
  }
} as const;

interface UnlockViewArgs {
  view_name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UnlockView MCP tool
 *
 * Uses CrudClient.unlockView - low-level single method call
 */
export async function handleUnlockView(args: UnlockViewArgs) {
  try {
    const {
      view_name,
      lock_handle,
      session_id,
      session_state
    } = args as UnlockViewArgs;

    // Validation
    if (!view_name || !lock_handle || !session_id) {
      return return_error(new Error('view_name, lock_handle, and session_id are required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_state) {
      connection.setSessionState({
        cookies: session_state.cookies || null,
        csrfToken: session_state.csrf_token || null,
        cookieStore: session_state.cookie_store || {}
      });
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const viewName = view_name.toUpperCase();

    logger.info(`Starting view unlock: ${viewName} (session: ${session_id.substring(0, 8)}...)`);

    try {
      // Unlock view
      await client.unlockView({ viewName: viewName }, lock_handle);
      const unlockResult = client.getUnlockResult();

      if (!unlockResult) {
        throw new Error(`Unlock did not return a response for view ${viewName}`);
      }

      // Get updated session state after unlock
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ UnlockView completed: ${viewName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          view_name: viewName,
          session_id: session_id,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `View ${viewName} unlocked successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error unlocking view ${viewName}:`, error);

      // Parse error message
      let errorMessage = `Failed to unlock view: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `View ${viewName} not found.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Invalid lock handle or session. Make sure you're using the same session_id and lock_handle from LockView.`;
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

