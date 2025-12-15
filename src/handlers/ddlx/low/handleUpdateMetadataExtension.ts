/**
 * UpdateMetadataExtension Handler - Update ABAP Metadata Extension Source Code
 *
 * Uses CrudClient.updateMetadataExtension from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse, return_error, return_response, logger as baseLogger, restoreSessionInConnection } from '../../../lib/utils';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "UpdateMetadataExtensionLow",
  description: "[low-level] Update source code of an existing ABAP metadata extension. Requires lock handle from LockObject. - use UpdateMetadataExtension (high-level) for full workflow with lock/unlock/activate.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Metadata extension name (e.g., ZOK_C_TEST_0001). Metadata extension must already exist."
      },
      source_code: {
        type: "string",
        description: "Complete metadata extension source code."
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
    required: ["name", "source_code", "lock_handle"]
  }
} as const;

interface UpdateMetadataExtensionArgs {
  name: string;
  source_code: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UpdateMetadataExtension MCP tool
 *
 * Uses CrudClient.updateMetadataExtension - low-level single method call
 */
export async function handleUpdateMetadataExtension(connection: AbapConnection, args: UpdateMetadataExtensionArgs) {
  try {
    const {
      name,
      source_code,
      lock_handle,
      session_id,
      session_state
    } = args as UpdateMetadataExtensionArgs;

    // Validation
    if (!name || !source_code || !lock_handle) {
      return return_error(new Error('name, source_code, and lock_handle are required'));
    }

        const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleUpdateMetadataExtension',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
          }

    const metadataExtensionName = name.toUpperCase();

    handlerLogger.info(`Starting metadata extension update: ${metadataExtensionName}`);

    try {
      // Update metadata extension with source code
      await client.updateMetadataExtension({
        name: metadataExtensionName,
        sourceCode: source_code
      }, lock_handle);
      const updateResult = client.getUpdateResult();

      if (!updateResult) {
        throw new Error(`Update did not return a response for metadata extension ${metadataExtensionName}`);
      }

      // Get updated session state after update


      handlerLogger.info(`✅ UpdateMetadataExtension completed: ${metadataExtensionName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          name: metadataExtensionName,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `Metadata extension ${metadataExtensionName} updated successfully. Remember to unlock using UnlockObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error updating metadata extension ${metadataExtensionName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to update metadata extension: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Metadata extension ${metadataExtensionName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Metadata extension ${metadataExtensionName} is locked by another user or lock handle is invalid.`;
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
