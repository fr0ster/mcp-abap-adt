/**
 * UpdateFunctionInclude Handler - Update Existing ABAP Function Group Include Source Code
 *
 * Uses AdtClient.getFunctionInclude().update() for the high-level update operation.
 * Session and lock management handled internally by the builder.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateFunctionInclude',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Update. Subject: FunctionInclude. Will be useful for updating a function group include. Update source code of an existing ABAP function group include.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description:
          'Function group name containing the include (e.g., ZOK_FG_MCP01).',
      },
      include_name: {
        type: 'string',
        description:
          'Include name (e.g., LZOK_FG_MCP01F01). Include must already exist.',
      },
      source_code: {
        type: 'string',
        description: 'Complete ABAP include source code.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable includes.',
      },
      activate: {
        type: 'boolean',
        description:
          'Activate the include after the source update. Default: false. Set true to make the updated source the active version immediately.',
        default: false,
      },
    },
    required: ['function_group_name', 'include_name', 'source_code'],
  },
} as const;

interface UpdateFunctionIncludeArgs {
  function_group_name: string;
  include_name: string;
  source_code: string;
  transport_request?: string;
  activate?: boolean;
}

/**
 * Main handler for UpdateFunctionInclude MCP tool
 */
export async function handleUpdateFunctionInclude(
  context: HandlerContext,
  args: UpdateFunctionIncludeArgs,
): Promise<any> {
  const { connection, logger } = context;
  try {
    if (!args.function_group_name || args.function_group_name.length > 30) {
      return return_error(
        new Error(
          'Function group name is required and must not exceed 30 characters',
        ),
      );
    }
    if (!args.include_name) {
      return return_error(new Error('include_name is required'));
    }
    if (!args.source_code) {
      return return_error(new Error('Source code is required'));
    }

    const functionGroupName = args.function_group_name.toUpperCase();
    const includeName = args.include_name.toUpperCase();

    logger?.info(
      `Starting function include source update: ${includeName} in ${functionGroupName}`,
    );

    try {
      const client = createAdtClient(connection, logger);
      const shouldActivate = args.activate === true;

      await client.getFunctionInclude().update(
        {
          functionGroupName,
          includeName,
          sourceCode: args.source_code,
          transportRequest: args.transport_request,
        },
        { activateOnUpdate: shouldActivate },
      );

      logger?.info(
        `✅ UpdateFunctionInclude completed successfully: ${includeName}`,
      );

      const result = {
        success: true,
        function_group_name: functionGroupName,
        include_name: includeName,
        transport_request: args.transport_request || null,
        activated: shouldActivate,
        message: `Function include ${includeName} source code updated successfully${shouldActivate ? ' and activated' : ''}`,
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
    } catch (error: any) {
      logger?.error(
        `Error updating function include source ${includeName}: ${error?.message || error}`,
      );

      let errorMessage = error.response?.data
        ? typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data)
        : error.message || String(error);

      if (error.response?.status === 404) {
        errorMessage = `Function include ${includeName} not found in group ${functionGroupName}.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Function include ${includeName} is locked by another user or lock handle is invalid.`;
      } else if (error.response?.status === 400 && !args.transport_request) {
        errorMessage = `Update failed for ${includeName}. The object may be assigned to a transport request. Pass transport_request explicitly.`;
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
          // Keep original error message if XML parsing fails
        }
      }

      return return_error(
        new Error(`Failed to update function include source: ${errorMessage}`),
      );
    }
  } catch (error: any) {
    return return_error(error);
  }
}
