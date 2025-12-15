/**
 * DeleteView Handler - Delete ABAP View
 *
 * Uses CrudClient.deleteView from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { return_error, return_response, logger as baseLogger, AxiosResponse } from '../../../lib/utils';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "DeleteViewLow",
  description: "[low-level] Delete an ABAP view from the SAP system via ADT deletion API. Transport request optional for $TMP objects.",
  inputSchema: {
    type: "object",
    properties: {
      view_name: {
        type: "string",
        description: "View name (e.g., Z_MY_PROGRAM)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP)."
      }
    },
    required: ["view_name"]
  }
} as const;

interface DeleteViewArgs {
  view_name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteView MCP tool
 *
 * Uses CrudClient.deleteView - low-level single method call
 */
export async function handleDeleteView(connection: AbapConnection, args: DeleteViewArgs) {
  try {
    const {
      view_name,
      transport_request
    } = args as DeleteViewArgs;

    // Validation
    if (!view_name) {
      return return_error(new Error('view_name is required'));
    }

    const handlerLogger = getHandlerLogger(
      'handleDeleteView',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );
        const client = new CrudClient(connection);
    const viewName = view_name.toUpperCase();

    handlerLogger.info(`Starting view deletion: ${viewName}`);

    try {
      // Delete view
      await client.deleteView({ viewName: viewName, transportRequest: transport_request });
      const deleteResult = client.getDeleteResult();

      if (!deleteResult) {
        throw new Error(`Delete did not return a response for view ${viewName}`);
      }

      handlerLogger.info(`✅ DeleteView completed successfully: ${viewName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          view_name: viewName,
          transport_request: transport_request || null,
          message: `View ${viewName} deleted successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error deleting view ${viewName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to delete view: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `View ${viewName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `View ${viewName} is locked by another user. Cannot delete.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Bad request. Check if transport request is required and valid.`;
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
