/**
 * UpdateLocalMacros Handler - Update Local Macros via AdtClient
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  extractAdtErrorMessage,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateLocalMacros',
  description:
    'Update local macros in an ABAP class (macros include). Manages lock, check, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      macros_code: {
        type: 'string',
        description: 'Updated source code for local macros.',
      },
      transport_request: {
        type: 'string',
        description: 'Transport request number.',
      },
      activate_on_update: {
        type: 'boolean',
        description: 'Activate parent class after updating. Default: false',
        default: false,
      },
    },
    required: ['class_name', 'macros_code'],
  },
} as const;

interface UpdateLocalMacrosArgs {
  class_name: string;
  macros_code: string;
  transport_request?: string;
  activate_on_update?: boolean;
}

export async function handleUpdateLocalMacros(
  context: HandlerContext,
  args: UpdateLocalMacrosArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      class_name,
      macros_code,
      transport_request,
      activate_on_update = false,
    } = args as UpdateLocalMacrosArgs;

    if (!class_name || !macros_code) {
      return return_error(new Error('class_name and macros_code are required'));
    }

    const client = new AdtClient(connection, logger);
    const className = class_name.toUpperCase();

    logger?.info(`Updating local macros for ${className}`);

    try {
      const localMacros = client.getLocalMacros();
      const updateResult = await localMacros.update(
        {
          className,
          macrosCode: macros_code,
          transportRequest: transport_request,
        },
        { activateOnUpdate: activate_on_update },
      );

      if (!updateResult) {
        throw new Error(`Update did not return a result for ${className}`);
      }

      logger?.info(`✅ UpdateLocalMacros completed successfully: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            transport_request: transport_request || null,
            activated: activate_on_update,
            message: `Local macros updated successfully in ${className}.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error updating local macros for ${className}: ${error?.message || error}`,
      );

      const detailedError = extractAdtErrorMessage(
        error,
        `Failed to update local macros in ${className}`,
      );
      let errorMessage = `Failed to update local macros: ${detailedError}`;

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
