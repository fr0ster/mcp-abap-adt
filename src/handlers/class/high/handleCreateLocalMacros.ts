/**
 * CreateLocalMacros Handler - Create Local Macros via AdtClient
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateLocalMacros',
  description:
    'Create local macros in an ABAP class (macros include). Manages lock, check, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      macros_code: {
        type: 'string',
        description: 'Source code for local macros.',
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
    required: ['class_name', 'macros_code'],
  },
} as const;

interface CreateLocalMacrosArgs {
  class_name: string;
  macros_code: string;
  transport_request?: string;
  activate_on_create?: boolean;
}

export async function handleCreateLocalMacros(
  context: HandlerContext,
  args: CreateLocalMacrosArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      class_name,
      macros_code,
      transport_request,
      activate_on_create = false,
    } = args as CreateLocalMacrosArgs;

    if (!class_name || !macros_code) {
      return return_error(new Error('class_name and macros_code are required'));
    }

    const client = new AdtClient(connection, logger);
    const className = class_name.toUpperCase();

    logger?.info(`Creating local macros for ${className}`);

    try {
      const localMacros = client.getLocalMacros();
      const createResult = await localMacros.create(
        {
          className,
          macrosCode: macros_code,
          transportRequest: transport_request,
        },
        { activateOnCreate: activate_on_create },
      );

      if (!createResult) {
        throw new Error(`Create did not return a result for ${className}`);
      }

      logger?.info(`✅ CreateLocalMacros completed successfully: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            transport_request: transport_request || null,
            activated: activate_on_create,
            message: `Local macros created successfully in ${className}.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error creating local macros for ${className}: ${error?.message || error}`,
      );

      let errorMessage = `Failed to create local macros: ${error.message || String(error)}`;

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
