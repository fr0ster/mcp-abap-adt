import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import * as z from 'zod';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ErrorCode, McpError } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetFunctionGroup',
  description: '[read-only] Retrieve ABAP Function Group source code.',
  inputSchema: {
    function_group: z.string().describe('Name of the function group'),
  },
} as const;

export async function handleGetFunctionGroup(
  context: HandlerContext,
  args: any,
) {
  const { connection, logger } = context;
  try {
    if (!args?.function_group) {
      throw new McpError(ErrorCode.InvalidParams, 'Function Group is required');
    }

    logger?.info(`Reading function group ${args.function_group}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readFunctionGroup(args.function_group);
    logger?.debug(`Successfully read function group ${args.function_group}`);
    return {
      isError: false,
      content: [{ type: 'json', json: result }],
    };
  } catch (error) {
    logger?.error(
      `Failed to read function group ${args?.function_group || ''}`,
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
