import { McpError, ErrorCode } from '../../../lib/utils';
import * as z from 'zod';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "GetInterface",
  description: "[read-only] Retrieve ABAP interface source code.",
  inputSchema: {
    interface_name: z.string().describe("Name of the ABAP interface")
  }
} as const;

export async function handleGetInterface(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  try {
    if (!args?.interface_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Interface name is required');
    }

    logger?.info(`Reading interface ${args.interface_name}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readInterface(args.interface_name);
    logger?.debug(`Successfully read interface ${args.interface_name}`);
    return {
      isError: false,
      content: [{ type: "json", json: result }],
    };
  } catch (error) {
    logger?.error(`Failed to read interface ${args?.interface_name || ''}`, error as any);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }
}
