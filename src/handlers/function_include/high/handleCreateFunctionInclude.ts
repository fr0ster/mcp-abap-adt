/**
 * CreateFunctionInclude Handler - ABAP Function Group Include Creation via ADT API
 *
 * Workflow: validate -> create (include in initial state)
 * Source code is set via UpdateFunctionInclude handler.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateFunctionInclude',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Create. Subject: FunctionInclude. Will be useful for creating function group include. Create a new ABAP include within an existing function group. Creates the include in initial state.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Parent function group name (e.g., ZTEST_FG_001)',
      },
      include_name: {
        type: 'string',
        description: 'Include name (e.g., LZTEST_FG_001F01).',
      },
      description: {
        type: 'string',
        description: 'Optional description for the include',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
    },
    required: ['function_group_name', 'include_name'],
  },
} as const;

interface CreateFunctionIncludeArgs {
  function_group_name: string;
  include_name: string;
  description?: string;
  transport_request?: string;
}

/**
 * Main handler for CreateFunctionInclude MCP tool
 */
export async function handleCreateFunctionInclude(
  context: HandlerContext,
  args: CreateFunctionIncludeArgs,
) {
  const { connection, logger } = context;
  try {
    if (!args?.function_group_name) {
      return return_error(new Error('function_group_name is required'));
    }
    if (!args?.include_name) {
      return return_error(new Error('include_name is required'));
    }

    const functionGroupName = args.function_group_name.toUpperCase();
    const includeName = args.include_name.toUpperCase();

    logger?.info(
      `Starting function include creation: ${includeName} in ${functionGroupName}`,
    );

    try {
      const client = createAdtClient(connection, logger);

      await client.getFunctionInclude().create({
        functionGroupName,
        includeName,
        description: args.description || includeName,
        sourceCode: '',
        transportRequest: args.transport_request,
      });

      logger?.info(`Function include created: ${includeName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          function_group_name: functionGroupName,
          include_name: includeName,
          transport_request: args.transport_request || 'local',
          message: `Function include ${includeName} created successfully. Use UpdateFunctionInclude to set source code.`,
        }),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error creating function include ${includeName}: ${error?.message || error}`,
      );

      if (
        error.message?.includes('already exists') ||
        error.response?.status === 409
      ) {
        return return_error(
          new Error(
            `Function include ${includeName} already exists in group ${functionGroupName}. Please delete it first or use a different name.`,
          ),
        );
      }

      if (error.response?.status === 404) {
        return return_error(
          new Error(
            `Function group ${functionGroupName} not found. Create the function group first.`,
          ),
        );
      }

      if (error.response?.status === 400) {
        return return_error(
          new Error(
            `Bad request. Check if include name is valid and function group exists.`,
          ),
        );
      }

      const errorMessage = error.response?.data
        ? typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data)
        : error.message || String(error);

      return return_error(
        new Error(
          `Failed to create function include ${includeName}: ${errorMessage}`,
        ),
      );
    }
  } catch (error: any) {
    return return_error(error);
  }
}
