/**
 * CreateLocalTypes Handler - Create Local Types via AdtClient
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateLocalTypes',
  description:
    'Create local types in an ABAP class (implementations include). Manages lock, check, update, unlock, and optional activation.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      local_types_code: {
        type: 'string',
        description: 'Source code for local types.',
      },
      transport_request: {
        type: 'string',
        description: 'Transport request number.',
      },
      activate_on_create: {
        type: 'boolean',
        description: 'Activate parent class after creating. Default: false',
        default: false,
      },
    },
    required: ['class_name', 'local_types_code'],
  },
} as const;

interface CreateLocalTypesArgs {
  class_name: string;
  local_types_code: string;
  transport_request?: string;
  activate_on_create?: boolean;
}

export async function handleCreateLocalTypes(
  context: HandlerContext,
  args: CreateLocalTypesArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      class_name,
      local_types_code,
      transport_request,
      activate_on_create = false,
    } = args as CreateLocalTypesArgs;

    if (!class_name || !local_types_code) {
      return return_error(
        new Error('class_name and local_types_code are required'),
      );
    }

    const client = createAdtClient(connection, logger);
    const className = class_name.toUpperCase();

    logger?.info(`Creating local types for ${className}`);

    try {
      const localTypes = client.getLocalTypes();
      const createResult = await localTypes.create(
        {
          className,
          localTypesCode: local_types_code,
          transportRequest: transport_request,
        },
        { activateOnCreate: activate_on_create },
      );

      if (!createResult) {
        throw new Error(`Create did not return a result for ${className}`);
      }

      logger?.info(`✅ CreateLocalTypes completed successfully: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            transport_request: transport_request || null,
            activated: activate_on_create,
            message: `Local types created successfully in ${className}.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error creating local types for ${className}: ${error?.message || error}`,
      );

      let errorMessage = `Failed to create local types: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Parent class ${className} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Class ${className} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
