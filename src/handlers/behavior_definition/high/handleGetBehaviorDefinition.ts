/**
 * GetBehaviorDefinition Handler - Read ABAP BehaviorDefinition via AdtClient
 *
 * Uses AdtClient.getBehaviorDefinition().read() for high-level read operation.
 * Supports both active and inactive versions.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetBehaviorDefinition',
  description:
    'Retrieve ABAP behavior definition definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior_definition_name: {
        type: 'string',
        description: 'BehaviorDefinition name (e.g., Z_MY_BEHAVIORDEFINITION).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['behavior_definition_name'],
  },
} as const;

interface GetBehaviorDefinitionArgs {
  behavior_definition_name: string;
  version?: 'active' | 'inactive';
}

/**
 * Main handler for GetBehaviorDefinition MCP tool
 *
 * Uses AdtClient.getBehaviorDefinition().read() - high-level read operation
 */
export async function handleGetBehaviorDefinition(
  context: HandlerContext,
  args: GetBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  try {
    const { behavior_definition_name, version = 'active' } =
      args as GetBehaviorDefinitionArgs;

    // Validation
    if (!behavior_definition_name) {
      return return_error(new Error('behavior_definition_name is required'));
    }

    const client = new AdtClient(connection, logger);
    const behaviorDefinitionName = behavior_definition_name.toUpperCase();

    logger?.info(
      `Reading behavior definition ${behaviorDefinitionName}, version: ${version}`,
    );

    try {
      // Read behavior definition using AdtClient
      const behaviorDefinitionObject = client.getBehaviorDefinition();
      const readResult = await behaviorDefinitionObject.read(
        { name: behaviorDefinitionName },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(
          `BehaviorDefinition ${behaviorDefinitionName} not found`,
        );
      }

      // Extract data from read result
      const behaviorDefinitionData =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(
        `✅ GetBehaviorDefinition completed successfully: ${behaviorDefinitionName}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            behavior_definition_name: behaviorDefinitionName,
            version,
            behavior_definition_data: behaviorDefinitionData,
            status: readResult.readResult.status,
            status_text: readResult.readResult.statusText,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading behavior definition ${behaviorDefinitionName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to read behavior definition: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `BehaviorDefinition ${behaviorDefinitionName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `BehaviorDefinition ${behaviorDefinitionName} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
