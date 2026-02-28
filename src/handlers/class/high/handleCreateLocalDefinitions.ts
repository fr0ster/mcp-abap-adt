/**
 * CreateLocalDefinitions Handler - Create Local Definitions via AdtClient
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateLocalDefinitions',
  description:
    'Create local definitions in an ABAP class (definitions include). Manages lock, check, update, unlock, and optional activation.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      definitions_code: {
        type: 'string',
        description: 'Source code for local definitions.',
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
    required: ['class_name', 'definitions_code'],
  },
} as const;

interface CreateLocalDefinitionsArgs {
  class_name: string;
  definitions_code: string;
  transport_request?: string;
  activate_on_create?: boolean;
}

export async function handleCreateLocalDefinitions(
  context: HandlerContext,
  args: CreateLocalDefinitionsArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      class_name,
      definitions_code,
      transport_request,
      activate_on_create = false,
    } = args as CreateLocalDefinitionsArgs;

    if (!class_name || !definitions_code) {
      return return_error(
        new Error('class_name and definitions_code are required'),
      );
    }

    const client = createAdtClient(connection, logger);
    const className = class_name.toUpperCase();

    logger?.info(`Creating local definitions for ${className}`);

    try {
      const localDefinitions = client.getLocalDefinitions();
      const createResult = await localDefinitions.create(
        {
          className,
          definitionsCode: definitions_code,
          transportRequest: transport_request,
        },
        { activateOnCreate: activate_on_create },
      );

      if (!createResult) {
        throw new Error(`Create did not return a result for ${className}`);
      }

      logger?.info(
        `✅ CreateLocalDefinitions completed successfully: ${className}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            transport_request: transport_request || null,
            activated: activate_on_create,
            message: `Local definitions created successfully in ${className}.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error creating local definitions for ${className}: ${error?.message || error}`,
      );

      let errorMessage = `Failed to create local definitions: ${error.message || String(error)}`;

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
