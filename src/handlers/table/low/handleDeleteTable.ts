/**
 * DeleteTable Handler - Delete ABAP Table
 *
 * Uses CrudClient.deleteTable from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse  } from '../../../lib/utils';
import { AbapConnection } from '@mcp-abap-adt/connection'; } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "DeleteTableLow",
  description: "[low-level] Delete an ABAP table from the SAP system via ADT deletion API. Transport request optional for $TMP objects.",
  inputSchema: {
    type: "object",
    properties: {
      table_name: {
        type: "string",
        description: "Table name (e.g., Z_MY_PROGRAM)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP)."
      }
    },
    required: ["table_name"]
  }
} as const;

interface DeleteTableArgs {
  table_name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteTable MCP tool
 *
 * Uses CrudClient.deleteTable - low-level single method call
 */
export async function handleDeleteTable(connection: AbapConnection, args: DeleteTableArgs) {
  try {
    const {
      table_name,
      transport_request
    } = args as DeleteTableArgs;

    // Validation
    if (!table_name) {
      return return_error(new Error('table_name is required'));
    }

        const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleDeleteTable',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );
    const tableName = table_name.toUpperCase();

    handlerLogger.info(`Starting table deletion: ${tableName}`);

    try {
      // Delete table
      await client.deleteTable({ tableName: tableName, transportRequest: transport_request });
      const deleteResult = client.getDeleteResult();

      if (!deleteResult) {
        throw new Error(`Delete did not return a response for table ${tableName}`);
      }

      handlerLogger.info(`✅ DeleteTable completed successfully: ${tableName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          table_name: tableName,
          transport_request: transport_request || null,
          message: `Table ${tableName} deleted successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error deleting table ${tableName}:`, error);

      // Parse error message
      let errorMessage = `Failed to delete table: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Table ${tableName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Table ${tableName} is locked by another user. Cannot delete.`;
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
