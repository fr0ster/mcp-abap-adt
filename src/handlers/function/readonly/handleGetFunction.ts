import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import * as z from 'zod';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ErrorCode, McpError } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetFunction',
  description: '[read-only] Retrieve ABAP Function Module source code.',
  inputSchema: {
    function_name: z.string().describe('Name of the function module'),
    function_group: z.string().describe('Name of the function group'),
  },
} as const;

export async function handleGetFunction(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  try {
    if (!args?.function_name || !args?.function_group) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Function name and group are required',
      );
    }

    logger?.info(
      `Reading function module ${args.function_name} in group ${args.function_group}`,
    );

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readFunctionModule(
      args.function_name,
      args.function_group,
    );
    logger?.debug(`Successfully read function module ${args.function_name}`);
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
