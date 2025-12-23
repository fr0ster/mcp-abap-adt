/**
 * DeleteBehaviorDefinition Handler - Delete ABAP BehaviorDefinition via AdtClient
 *
 * Uses AdtClient.getBehaviorDefinition().delete() for high-level delete operation.
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
  name: 'DeleteBehaviorDefinition',
  description:
    'Delete an ABAP behavior definition from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior_definition_name: {
        type: 'string',
        description: 'BehaviorDefinition name (e.g., Z_MY_BEHAVIORDEFINITION).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
      },
    },
    required: ['behavior_definition_name'],
  },
} as const;

interface DeleteBehaviorDefinitionArgs {
  behavior_definition_name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteBehaviorDefinition MCP tool
 *
 * Uses AdtClient.getBehaviorDefinition().delete() - high-level delete operation with deletion check
 */
export async function handleDeleteBehaviorDefinition(
  context: HandlerContext,
  args: DeleteBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  try {
    const { behavior_definition_name, transport_request } =
      args as DeleteBehaviorDefinitionArgs;

    // Validation
    if (!behavior_definition_name) {
      return return_error(new Error('behavior_definition_name is required'));
    }

    const client = new AdtClient(connection, logger);
    const behaviorDefinitionName = behavior_definition_name.toUpperCase();

    logger?.info(
      `Starting behavior definition deletion: ${behaviorDefinitionName}`,
    );

    try {
      // Delete behavior definition using AdtClient (includes deletion check)
      const behaviorDefinitionObject = client.getBehaviorDefinition();
      const deleteResult = await behaviorDefinitionObject.delete({
        name: behaviorDefinitionName,
        transportRequest: transport_request,
      });

      if (!deleteResult || !deleteResult.deleteResult) {
        throw new Error(
          `Delete did not return a response for behavior definition ${behaviorDefinitionName}`,
        );
      }

      logger?.info(
        `✅ DeleteBehaviorDefinition completed successfully: ${behaviorDefinitionName}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            behavior_definition_name: behaviorDefinitionName,
            transport_request: transport_request || null,
            message: `BehaviorDefinition ${behaviorDefinitionName} deleted successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error deleting behavior definition ${behaviorDefinitionName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to delete behavior definition: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `BehaviorDefinition ${behaviorDefinitionName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `BehaviorDefinition ${behaviorDefinitionName} is locked by another user. Cannot delete.`;
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
