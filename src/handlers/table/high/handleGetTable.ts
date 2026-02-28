/**
 * GetTable Handler - Read ABAP Table via AdtClient
 *
 * Uses AdtClient.getTable().read() for high-level read operation.
 * Supports both active and inactive versions.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetTable',
  description:
    'Retrieve ABAP table definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description: 'Table name (e.g., Z_MY_TABLE).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['table_name'],
  },
} as const;

interface GetTableArgs {
  table_name: string;
  version?: 'active' | 'inactive';
}

/**
 * Main handler for GetTable MCP tool
 *
 * Uses AdtClient.getTable().read() - high-level read operation
 */
export async function handleGetTable(
  context: HandlerContext,
  args: GetTableArgs,
) {
  const { connection, logger } = context;
  try {
    const { table_name, version = 'active' } = args as GetTableArgs;

    // Validation
    if (!table_name) {
      return return_error(new Error('table_name is required'));
    }

    const client = createAdtClient(connection, logger);
    const tableName = table_name.toUpperCase();

    logger?.info(`Reading table ${tableName}, version: ${version}`);

    try {
      // Read table using AdtClient
      const tableObject = client.getTable();
      const readResult = await tableObject.read(
        { tableName },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(`Table ${tableName} not found`);
      }

      // Extract data from read result
      const tableData =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(`✅ GetTable completed successfully: ${tableName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            table_name: tableName,
            version,
            table_data: tableData,
            status: readResult.readResult.status,
            status_text: readResult.readResult.statusText,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading table ${tableName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to read table: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Table ${tableName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Table ${tableName} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
