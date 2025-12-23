/**
 * GetBehaviorImplementation Handler - Read ABAP BehaviorImplementation via AdtClient
 *
 * Uses AdtClient.getBehaviorImplementation().read() for high-level read operation.
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
  name: 'GetBehaviorImplementation',
  description:
    'Retrieve ABAP behavior implementation definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior_implementation_name: {
        type: 'string',
        description:
          'BehaviorImplementation name (e.g., Z_MY_BEHAVIORIMPLEMENTATION).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['behavior_implementation_name'],
  },
} as const;

interface GetBehaviorImplementationArgs {
  behavior_implementation_name: string;
  version?: 'active' | 'inactive';
}

/**
 * Main handler for GetBehaviorImplementation MCP tool
 *
 * Uses AdtClient.getBehaviorImplementation().read() - high-level read operation
 */
export async function handleGetBehaviorImplementation(
  context: HandlerContext,
  args: GetBehaviorImplementationArgs,
) {
  const { connection, logger } = context;
  try {
    const { behavior_implementation_name, version = 'active' } =
      args as GetBehaviorImplementationArgs;

    // Validation
    if (!behavior_implementation_name) {
      return return_error(
        new Error('behavior_implementation_name is required'),
      );
    }

    const client = new AdtClient(connection, logger);
    const behaviorImplementationName =
      behavior_implementation_name.toUpperCase();

    logger?.info(
      `Reading behavior implementation ${behaviorImplementationName}, version: ${version}`,
    );

    try {
      // Read behavior implementation using AdtClient
      const behaviorImplementationObject = client.getBehaviorImplementation();
      const readResult = await behaviorImplementationObject.read(
        { className: behaviorImplementationName },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(
          `BehaviorImplementation ${behaviorImplementationName} not found`,
        );
      }

      // Extract data from read result
      const behaviorImplementationData =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(
        `✅ GetBehaviorImplementation completed successfully: ${behaviorImplementationName}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            behavior_implementation_name: behaviorImplementationName,
            version,
            behavior_implementation_data: behaviorImplementationData,
            status: readResult.readResult.status,
            status_text: readResult.readResult.statusText,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading behavior implementation ${behaviorImplementationName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to read behavior implementation: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `BehaviorImplementation ${behaviorImplementationName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `BehaviorImplementation ${behaviorImplementationName} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
