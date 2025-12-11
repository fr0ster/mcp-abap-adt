/**
 * DeleteFunctionGroup Handler - Delete ABAP FunctionGroup
 *
 * Uses CrudClient.deleteFunctionGroup from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "DeleteFunctionGroupLow",
  description: "[low-level] Delete an ABAP function group from the SAP system via ADT deletion API. Transport request optional for $TMP objects.",
  inputSchema: {
    type: "object",
    properties: {
      function_group_name: {
        type: "string",
        description: "FunctionGroup name (e.g., Z_MY_PROGRAM)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP)."
      }
    },
    required: ["function_group_name"]
  }
} as const;

interface DeleteFunctionGroupArgs {
  function_group_name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteFunctionGroup MCP tool
 *
 * Uses CrudClient.deleteFunctionGroup - low-level single method call
 */
export async function handleDeleteFunctionGroup(args: DeleteFunctionGroupArgs) {
  try {
    const {
      function_group_name,
      transport_request
    } = args as DeleteFunctionGroupArgs;

    // Validation
    if (!function_group_name) {
      return return_error(new Error('function_group_name is required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);
    const functionGroupName = function_group_name.toUpperCase();
    const handlerLogger = getHandlerLogger(
      'handleDeleteFunctionGroup',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    handlerLogger.info(`Starting function group deletion: ${functionGroupName}`);

    try {
      // Delete function group
      await client.deleteFunctionGroup({ functionGroupName: functionGroupName, transportRequest: transport_request });
      const deleteResult = client.getDeleteResult();

      if (!deleteResult) {
        throw new Error(`Delete did not return a response for function group ${functionGroupName}`);
      }

      handlerLogger.info(`✅ DeleteFunctionGroup completed successfully: ${functionGroupName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          function_group_name: functionGroupName,
          transport_request: transport_request || null,
          message: `FunctionGroup ${functionGroupName} deleted successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error deleting function group ${functionGroupName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to delete function group: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `FunctionGroup ${functionGroupName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `FunctionGroup ${functionGroupName} is locked by another user. Cannot delete.`;
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
