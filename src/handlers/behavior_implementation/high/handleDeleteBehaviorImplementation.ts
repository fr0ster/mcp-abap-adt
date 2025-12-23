/**
 * DeleteBehaviorImplementation Handler - Delete ABAP BehaviorImplementation via AdtClient
 *
 * Uses AdtClient.getBehaviorImplementation().delete() for high-level delete operation.
 * Includes deletion check before actual deletion.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteBehaviorImplementation',
  description:
    'Delete an ABAP behavior implementation from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior_implementation_name: {
        type: 'string',
        description:
          'BehaviorImplementation name (e.g., Z_MY_BEHAVIORIMPLEMENTATION).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
      },
    },
    required: ['behavior_implementation_name'],
  },
} as const;

interface DeleteBehaviorImplementationArgs {
  behavior_implementation_name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteBehaviorImplementation MCP tool
 *
 * Uses AdtClient.getBehaviorImplementation().delete() - high-level delete operation with deletion check
 */
export async function handleDeleteBehaviorImplementation(
  context: HandlerContext,
  args: DeleteBehaviorImplementationArgs,
) {
  const { connection, logger } = context;
  try {
    const { behavior_implementation_name, transport_request } =
      args as DeleteBehaviorImplementationArgs;

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
      `Starting behavior implementation deletion: ${behaviorImplementationName}`,
    );

    try {
      // Delete behavior implementation using AdtClient (includes deletion check)
      const behaviorImplementationObject = client.getBehaviorImplementation();
      const deleteResult = await behaviorImplementationObject.delete({
        className: behaviorImplementationName,
        transportRequest: transport_request,
      });

      if (!deleteResult || !deleteResult.deleteResult) {
        throw new Error(
          `Delete did not return a response for behavior implementation ${behaviorImplementationName}`,
        );
      }

      logger?.info(
        `✅ DeleteBehaviorImplementation completed successfully: ${behaviorImplementationName}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            behavior_implementation_name: behaviorImplementationName,
            transport_request: transport_request || null,
            message: `BehaviorImplementation ${behaviorImplementationName} deleted successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error deleting behavior implementation ${behaviorImplementationName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to delete behavior implementation: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `BehaviorImplementation ${behaviorImplementationName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `BehaviorImplementation ${behaviorImplementationName} is locked by another user. Cannot delete.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Bad request. Check if transport request is required and valid.`;
      } else if (
        error.response?.data &&
        typeof error.response.data === 'string'
      ) {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg =
            errorData['exc:exception']?.message?.['#text'] ||
            errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (_parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
