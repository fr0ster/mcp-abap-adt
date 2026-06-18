import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ListFunctionGroupIncludes',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[read-only] List the includes (TOP, custom) of an ABAP function group.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Function group name (e.g., Z_MY_FG).',
      },
    },
    required: ['function_group_name'],
  },
} as const;

export async function handleListFunctionGroupIncludes(
  context: HandlerContext,
  args: { function_group_name: string },
) {
  const { connection, logger } = context;
  try {
    const { function_group_name } = args;
    if (!function_group_name)
      return return_error(new Error('function_group_name is required'));

    const client = createAdtClient(connection, logger);
    const functionGroupName = function_group_name.toUpperCase();
    const includes = await client
      .getUtils()
      .listFunctionGroupIncludes(functionGroupName);

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          function_group_name: functionGroupName,
          total: includes.length,
          includes,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    return return_error(error);
  }
}
