import { McpError, ErrorCode } from '../../../lib/utils';
import * as z from 'zod';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "GetTable",
  description: "[read-only] Retrieve ABAP table structure.",
  inputSchema: {
    table_name: z.string().describe("Name of the ABAP table")
  }
} as const;

export async function handleGetTable(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  try {
    if (!args?.table_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Table name is required');
    }

    logger.info(`Reading table ${args.table_name}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readTable(args.table_name);
    logger.debug(`Successfully read table ${args.table_name}`);
    return {
      isError: false,
      content: [{ type: "json", json: result }],
    };
  } catch (error) {
    logger.error(`Failed to read table ${args?.table_name || ''}`, error as any);
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
