import { McpError, ErrorCode, logger as baseLogger } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "GetTable",
  description: "[read-only] Retrieve ABAP table structure.",
  inputSchema: {
    table_name: z.string().describe("Name of the ABAP table")
  }
} as const;

export async function handleGetTable(connection: AbapConnection, args: any) {
  const handlerLogger = getHandlerLogger(
    'handleGetTable',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  try {
    if (!args?.table_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Table name is required');
    }

    handlerLogger.info(`Reading table ${args.table_name}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readTable(args.table_name);
    handlerLogger.debug(`Successfully read table ${args.table_name}`);
    return {
      isError: false,
      content: [{ type: "json", json: result }],
    };
  } catch (error) {
    handlerLogger.error(`Failed to read table ${args?.table_name || ''}`, error as any);
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
