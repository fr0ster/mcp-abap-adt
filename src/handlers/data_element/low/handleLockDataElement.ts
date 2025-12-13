/**
 * LockDataElement Handler - Lock ABAP DataElement
 *
 * Uses CrudClient.lockDataElement from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse, return_error, return_response, logger as baseLogger, getManagedConnection, restoreSessionInConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "LockDataElementLow",
  description: "[low-level] Lock an ABAP data element for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.",
  inputSchema: {
    type: "object",
    properties: {
      data_element_name: {
        type: "string",
        description: "DataElement name (e.g., Z_MY_PROGRAM)."
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
    required: ["data_element_name"]
  }
} as const;

interface LockDataElementArgs {
  data_element_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for LockDataElement MCP tool
 *
 * Uses CrudClient.lockDataElement - low-level single method call
 */
export async function handleLockDataElement(args: LockDataElementArgs) {
  try {
    const {
      data_element_name,
      session_id,
      session_state
    } = args as LockDataElementArgs;

    // Validation
    if (!data_element_name) {
      return return_error(new Error('data_element_name is required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleLockDataElement',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const dataElementName = data_element_name.toUpperCase();

    handlerLogger.info(`Starting data element lock: ${dataElementName}`);

    try {
      // Lock data element
      await client.lockDataElement({ dataElementName: dataElementName });
      const lockHandle = client.getLockHandle();

      if (!lockHandle) {
        handlerLogger.error(`Lock did not return a lock handle for data element ${dataElementName}`);
        throw new Error(`Lock did not return a lock handle for data element ${dataElementName}`);
      }

      // Get updated session state after lock


      handlerLogger.info(`✅ LockDataElement completed: ${dataElementName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          data_element_name: dataElementName,
          session_id: session_id || null,
          lock_handle: lockHandle,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `DataElement ${dataElementName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error locking data element ${dataElementName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to lock data element: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `DataElement ${dataElementName} not found.`;
      } else if (error.response?.status === 409) {
        errorMessage = `DataElement ${dataElementName} is already locked by another user.`;
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
