/**
 * UpdateLocalTypes Handler - Update Local Types via AdtClient
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateLocalTypes',
  description:
    'Update local types in an ABAP class (implementations include). Manages lock, check, update, unlock, and optional activation.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      local_types_code: {
        type: 'string',
        description: 'Updated source code for local types.',
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
    required: ['class_name', 'local_types_code'],
  },
} as const;

interface UpdateLocalTypesArgs {
  class_name: string;
  local_types_code: string;
  transport_request?: string;
  activate_on_update?: boolean;
}

export async function handleUpdateLocalTypes(
  context: HandlerContext,
  args: UpdateLocalTypesArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      class_name,
      local_types_code,
      transport_request,
      activate_on_update = false,
    } = args as UpdateLocalTypesArgs;

    if (!class_name || !local_types_code) {
      return return_error(
        new Error('class_name and local_types_code are required'),
      );
    }

    const client = new AdtClient(connection, logger);
    const className = class_name.toUpperCase();

    logger?.info(`Updating local types for ${className}`);

    try {
      const localTypes = client.getLocalTypes();
      const updateResult = await localTypes.update(
        {
          className,
          localTypesCode: local_types_code,
          transportRequest: transport_request,
        },
        { activateOnUpdate: activate_on_update },
      );

      if (!updateResult) {
        throw new Error(`Update did not return a result for ${className}`);
      }

      logger?.info(`✅ UpdateLocalTypes completed successfully: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            transport_request: transport_request || null,
            activated: activate_on_update,
            message: `Local types updated successfully in ${className}.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error updating local types for ${className}: ${error?.message || error}`,
      );

      let errorMessage = `Failed to update local types: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Local types for ${className} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Class ${className} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
