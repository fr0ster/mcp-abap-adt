/**
 * GetStructure Handler - Read ABAP Structure via AdtClient
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetStructure',
  description:
    'Retrieve ABAP structure definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      structure_name: {
        type: 'string',
        description: 'Structure name (e.g., Z_MY_STRUCTURE).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['structure_name'],
  },
} as const;

interface GetStructureArgs {
  structure_name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetStructure(
  context: HandlerContext,
  args: GetStructureArgs,
) {
  const { connection, logger } = context;
  try {
    const { structure_name, version = 'active' } = args as GetStructureArgs;

    if (!structure_name) {
      return return_error(new Error('structure_name is required'));
    }

    const client = new AdtClient(connection, logger);
    const structureName = structure_name.toUpperCase();

    logger?.info(`Reading structure ${structureName}, version: ${version}`);

    try {
      const structureObject = client.getStructure();
      const readResult = await structureObject.read(
        { structureName },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(`Structure ${structureName} not found`);
      }

      const structureData =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(`✅ GetStructure completed successfully: ${structureName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            structure_name: structureName,
            version,
            structure_data: structureData,
            status: readResult.readResult.status,
            status_text: readResult.readResult.statusText,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading structure ${structureName}: ${error?.message || error}`,
      );

      let errorMessage = `Failed to read structure: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Structure ${structureName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Structure ${structureName} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
