import { McpError, ErrorCode } from '../../../lib/utils';
import * as z from 'zod';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "GetClass",
  description: "[read-only] Retrieve ABAP class source code.",
  inputSchema: {
    class_name: z.string().describe("Name of the ABAP class")
  }
} as const;

export async function handleGetClass(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  try {
    if (!args?.class_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Class name is required');
    }

    logger?.info(`Reading class ${args.class_name}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readClass(args.class_name);
    logger?.debug(`Successfully read class ${args.class_name}`);
    return {
      isError: false,
      content: [{ type: "json", json: result }],
    };
  } catch (error) {
    logger?.error(`Failed to read class ${args?.class_name || ''}`, error as any);
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
