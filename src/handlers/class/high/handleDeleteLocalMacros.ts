/**
 * DeleteLocalMacros Handler - Delete Local Macros via AdtClient
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteLocalMacros',
  description:
    'Delete local macros from an ABAP class by clearing the macros include. Manages lock, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.',
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

interface DeleteLocalMacrosArgs {
  class_name: string;
  transport_request?: string;
  activate_on_delete?: boolean;
}

export async function handleDeleteLocalMacros(
  context: HandlerContext,
  args: DeleteLocalMacrosArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      class_name,
      transport_request,
      activate_on_delete = false,
    } = args as DeleteLocalMacrosArgs;

    if (!class_name) {
      return return_error(new Error('class_name is required'));
    }

    const client = createAdtClient(connection, logger);
    const className = class_name.toUpperCase();

    logger?.info(`Deleting local macros for ${className}`);

    try {
      const localMacros = client.getLocalMacros();
      const deleteResult = await localMacros.delete({
        className,
        transportRequest: transport_request,
      });

      if (!deleteResult) {
        throw new Error(`Delete did not return a result for ${className}`);
      }

      if (activate_on_delete) {
        await client.getClass().activate({ className });
      }

      logger?.info(`✅ DeleteLocalMacros completed successfully: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            transport_request: transport_request || null,
            activated: activate_on_delete,
            message: `Local macros deleted successfully from ${className}.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error deleting local macros for ${className}: ${error?.message || error}`,
      );

      let errorMessage = `Failed to delete local macros: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Local macros for ${className} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Class ${className} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
