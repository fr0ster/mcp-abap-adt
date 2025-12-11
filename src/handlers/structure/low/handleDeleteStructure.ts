/**
 * DeleteStructure Handler - Delete ABAP Structure
 *
 * Uses CrudClient.deleteStructure from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "DeleteStructureLow",
  description: "[low-level] Delete an ABAP structure from the SAP system via ADT deletion API. Transport request optional for $TMP objects.",
  inputSchema: {
    type: "object",
    properties: {
      structure_name: {
        type: "string",
        description: "Structure name (e.g., Z_MY_PROGRAM)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP)."
      }
    },
    required: ["structure_name"]
  }
} as const;

interface DeleteStructureArgs {
  structure_name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteStructure MCP tool
 *
 * Uses CrudClient.deleteStructure - low-level single method call
 */
export async function handleDeleteStructure(args: DeleteStructureArgs) {
  try {
    const {
      structure_name,
      transport_request
    } = args as DeleteStructureArgs;

    // Validation
    if (!structure_name) {
      return return_error(new Error('structure_name is required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleDeleteStructure',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );
    const structureName = structure_name.toUpperCase();

    handlerLogger.info(`Starting structure deletion: ${structureName}`);

    try {
      // Delete structure
      await client.deleteStructure({ structureName: structureName, transportRequest: transport_request });
      const deleteResult = client.getDeleteResult();

      if (!deleteResult) {
        throw new Error(`Delete did not return a response for structure ${structureName}`);
      }

      handlerLogger.info(`✅ DeleteStructure completed successfully: ${structureName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          structure_name: structureName,
          transport_request: transport_request || null,
          message: `Structure ${structureName} deleted successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error deleting structure ${structureName}:`, error);

      // Parse error message
      let errorMessage = `Failed to delete structure: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Structure ${structureName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Structure ${structureName} is locked by another user. Cannot delete.`;
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
