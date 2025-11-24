/**
 * DeleteInterface Handler - Delete ABAP Interface
 *
 * Uses CrudClient.deleteInterface from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "DeleteInterface",
  description: "[low-level] Delete an ABAP interface from the SAP system via ADT deletion API. Transport request optional for $TMP objects.",
  inputSchema: {
    type: "object",
    properties: {
      interface_name: {
        type: "string",
        description: "Interface name (e.g., Z_MY_PROGRAM)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP)."
      }
    },
    required: ["interface_name"]
  }
} as const;

interface DeleteInterfaceArgs {
  interface_name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteInterface MCP tool
 *
 * Uses CrudClient.deleteInterface - low-level single method call
 */
export async function handleDeleteInterface(args: any) {
  try {
    const {
      interface_name,
      transport_request
    } = args as DeleteInterfaceArgs;

    // Validation
    if (!interface_name) {
      return return_error(new Error('interface_name is required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);
    const interfaceName = interface_name.toUpperCase();

    logger.info(`Starting interface deletion: ${interfaceName}`);

    try {
      // Delete interface
      await client.deleteInterface(interfaceName, transport_request);
      const deleteResult = client.getDeleteResult();

      if (!deleteResult) {
        throw new Error(`Delete did not return a response for interface ${interfaceName}`);
      }

      logger.info(`✅ DeleteInterface completed successfully: ${interfaceName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          interface_name: interfaceName,
          transport_request: transport_request || null,
          message: `Interface ${interfaceName} deleted successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error deleting interface ${interfaceName}:`, error);

      // Parse error message
      let errorMessage = `Failed to delete interface: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Interface ${interfaceName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Interface ${interfaceName} is locked by another user. Cannot delete.`;
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

