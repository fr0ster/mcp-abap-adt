/**
 * UnlockDataElement Handler - Unlock ABAP DataElement
 *
 * Uses CrudClient.unlockDataElement from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, logger as baseLogger, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "UnlockDataElementLow",
  description: "[low-level] Unlock an ABAP data element after modification. Must use the same session_id and lock_handle from LockDataElement operation.",
  inputSchema: {
    type: "object",
    properties: {
      data_element_name: {
        type: "string",
        description: "DataElement name (e.g., Z_MY_PROGRAM)."
      },
      lock_handle: {
        type: "string",
        description: "Lock handle from LockDataElement operation."
      },
      session_id: {
        type: "string",
        description: "Session ID from LockDataElement operation. Must be the same as used in LockDataElement."
      },
      session_state: {
        type: "object",
        description: "Session state from LockDataElement (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["data_element_name", "lock_handle", "session_id"]
  }
} as const;

interface UnlockDataElementArgs {
  data_element_name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UnlockDataElement MCP tool
 *
 * Uses CrudClient.unlockDataElement - low-level single method call
 */
export async function handleUnlockDataElement(connection: AbapConnection, args: UnlockDataElementArgs) {
  try {
    const {
      data_element_name,
      lock_handle,
      session_id,
      session_state
    } = args as UnlockDataElementArgs;

    // Validation
    if (!data_element_name || !lock_handle || !session_id) {
      return return_error(new Error('data_element_name, lock_handle, and session_id are required'));
    }

        const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleUnlockDataElement',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    // Restore session state if provided
    if (session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
          }

    const dataElementName = data_element_name.toUpperCase();

    handlerLogger.info(`Starting data element unlock: ${dataElementName}`);

    try {
      // Unlock data element
      await client.unlockDataElement({ dataElementName: dataElementName }, lock_handle);
      const unlockResult = client.getUnlockResult();

      if (!unlockResult) {
        handlerLogger.error(`Unlock did not return a response for data element ${dataElementName}`);
        throw new Error(`Unlock did not return a response for data element ${dataElementName}`);
      }

      // Get updated session state after unlock


      handlerLogger.info(`✅ UnlockDataElement completed: ${dataElementName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          data_element_name: dataElementName,
          session_id: session_id,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `DataElement ${dataElementName} unlocked successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error unlocking data element ${dataElementName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to unlock data element: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `DataElement ${dataElementName} not found.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Invalid lock handle or session. Make sure you're using the same session_id and lock_handle from LockDataElement.`;
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
