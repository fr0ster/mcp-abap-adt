/**
 * GetDdl Handler - Read ABAP DDL Source via AdtClient
 *
 * Uses AdtClient.getDdl().read() for high-level read operation.
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
  name: 'GetDdl',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Retrieve ABAP DDL source definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name (e.g., Z_MY_VIEW).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['ddl_name'],
  },
} as const;

interface GetDdlArgs {
  ddl_name: string;
  version?: 'active' | 'inactive';
}

/**
 * Main handler for GetDdl MCP tool
 *
 * Uses AdtClient.getDdl().read() - high-level read operation
 */
export async function handleGetDdl(context: HandlerContext, args: GetDdlArgs) {
  const { connection, logger } = context;
  try {
    const { ddl_name, version = 'active' } = args as GetDdlArgs;

    // Validation
    if (!ddl_name) {
      return return_error(new Error('ddl_name is required'));
    }

    const client = createAdtClient(connection, logger);
    const ddlName = ddl_name.toUpperCase();

    logger?.info(`Reading DDL source ${ddlName}, version: ${version}`);

    try {
      // Read DDL source using AdtClient
      const ddlObject = client.getDdl();
      const readResult = await ddlObject.read(
        { ddlName: ddlName },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(`DDL source ${ddlName} not found`);
      }

      // Extract data from read result
      const ddlData =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(`✅ GetDdl completed successfully: ${ddlName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            ddl_name: ddlName,
            version,
            ddl_data: ddlData,
            status: readResult.readResult.status,
            status_text: readResult.readResult.statusText,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading DDL source ${ddlName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to read DDL source: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `DDL source ${ddlName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `DDL source ${ddlName} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
