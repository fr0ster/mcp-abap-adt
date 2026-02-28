import * as z from 'zod';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ErrorCode, McpError } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetFunction',
  description: '[read-only] Retrieve ABAP Function Module source code.',
  inputSchema: {
    function_name: z.string().describe('Name of the function module'),
    function_group: z.string().describe('Name of the function group'),
    version: z
      .enum(['active', 'inactive'])
      .default('active')
      .describe('Version to read'),
  },
} as const;

export async function handleGetFunction(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  try {
    if (!args?.function_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Function name is required');
    }
    if (!args?.function_group) {
      throw new McpError(ErrorCode.InvalidParams, 'Function group is required');
    }

    const functionModuleName = String(args.function_name).toUpperCase();
    const functionGroupName = String(args.function_group).toUpperCase();

    logger?.info(
      `Reading function module ${functionModuleName} in ${functionGroupName}, version: ${args.version || 'active'}`,
    );

    // Create client
    const client = createAdtClient(connection);
    const result = await client
      .getFunctionModule()
      .read(
        { functionModuleName, functionGroupName },
        args.version || 'active',
      );
    logger?.debug(`Successfully read function module ${functionModuleName}`);
    return {
      isError: false,
      content: [{ type: 'json', json: result }],
    };
  } catch (error) {
    logger?.error(
      `Failed to read function module ${args?.function_name || ''}`,
      error as any,
    );
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}
