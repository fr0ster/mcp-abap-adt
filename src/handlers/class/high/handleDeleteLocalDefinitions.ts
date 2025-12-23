/**
 * DeleteLocalDefinitions Handler - Delete Local Definitions via AdtClient
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteLocalDefinitions',
  description:
    'Delete local definitions from an ABAP class by clearing the definitions include. Manages lock, update, unlock, and optional activation.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      transport_request: {
        type: 'string',
        description: 'Transport request number.',
      },
      activate_on_delete: {
        type: 'boolean',
        description: 'Activate parent class after deleting. Default: false',
        default: false,
      },
    },
    required: ['class_name'],
  },
} as const;

interface DeleteLocalDefinitionsArgs {
  class_name: string;
  transport_request?: string;
  activate_on_delete?: boolean;
}

export async function handleDeleteLocalDefinitions(
  context: HandlerContext,
  args: DeleteLocalDefinitionsArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      class_name,
      transport_request,
      activate_on_delete = false,
    } = args as DeleteLocalDefinitionsArgs;

    if (!class_name) {
      return return_error(new Error('class_name is required'));
    }

    const client = new AdtClient(connection, logger);
    const className = class_name.toUpperCase();

    logger?.info(`Deleting local definitions for ${className}`);

    try {
      const localDefinitions = client.getLocalDefinitions();
      const deleteResult = await localDefinitions.delete({
        className,
        transportRequest: transport_request,
      });

      if (!deleteResult) {
        throw new Error(`Delete did not return a result for ${className}`);
      }

      if (activate_on_delete) {
        await client.getClass().activate({ className });
      }

      logger?.info(
        `✅ DeleteLocalDefinitions completed successfully: ${className}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            transport_request: transport_request || null,
            activated: activate_on_delete,
            message: `Local definitions deleted successfully from ${className}.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error deleting local definitions for ${className}: ${error?.message || error}`,
      );

      let errorMessage = `Failed to delete local definitions: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Local definitions for ${className} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Class ${className} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
