/**
 * DeleteFunctionModule Handler - Delete ABAP Function Module
 *
 * Uses CrudClient.deleteFunctionModule from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse  } from '../../../lib/utils';
import { AbapConnection } from '@mcp-abap-adt/connection';Logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "DeleteFunctionModuleLow",
  description: "[low-level] Delete an ABAP function module from the SAP system via ADT deletion API. Transport request optional for $TMP objects.",
  inputSchema: {
    type: "object",
    properties: {
      function_module_name: {
        type: "string",
        description: "Function module name (e.g., Z_MY_FUNCTION)."
      },
      function_group_name: {
        type: "string",
        description: "Function group name (e.g., ZFG_MY_GROUP)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP)."
      }
    },
    required: ["function_module_name", "function_group_name"]
  }
} as const;

interface DeleteFunctionModuleArgs {
  function_module_name: string;
  function_group_name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteFunctionModule MCP tool
 *
 * Uses CrudClient.deleteFunctionModule - low-level single method call
 */
export async function handleDeleteFunctionModule(connection: AbapConnection, args: DeleteFunctionModuleArgs) {
  try {
    const {
      function_module_name,
      function_group_name,
      transport_request
    } = args as DeleteFunctionModuleArgs;

    // Validation
    if (!function_module_name || !function_group_name) {
      return return_error(new Error('function_module_name and function_group_name are required'));
    }

        const client = new CrudClient(connection);
    const functionModuleName = function_module_name.toUpperCase();
    const functionGroupName = function_group_name.toUpperCase();
    const handlerLogger = getHandlerLogger(
      'handleDeleteFunctionModule',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    handlerLogger.info(`Starting function module deletion: ${functionModuleName} in ${functionGroupName}`);

    try {
      // Delete function module
      await client.deleteFunctionModule({ functionModuleName: functionModuleName, functionGroupName: functionGroupName, transportRequest: transport_request });
      const deleteResult = client.getDeleteResult();

      if (!deleteResult) {
        throw new Error(`Delete did not return a response for function module ${functionModuleName}`);
      }

      handlerLogger.info(`✅ DeleteFunctionModule completed successfully: ${functionModuleName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          transport_request: transport_request || null,
          message: `Function module ${functionModuleName} deleted successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error deleting function module ${functionModuleName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to delete function module: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Function module ${functionModuleName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Function module ${functionModuleName} is locked by another user. Cannot delete.`;
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
