import { McpError, ErrorCode, logger as baseLogger } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "GetFunctionGroup",
  description: "[read-only] Retrieve ABAP Function Group source code.",
  inputSchema: {
    function_group: z.string().describe("Name of the function group")
  }
} as const;

export async function handleGetFunctionGroup(connection: AbapConnection, args: any) {
  const handlerLogger = getHandlerLogger(
    'handleGetFunctionGroup',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  try {
    if (!args?.function_group) {
      throw new McpError(ErrorCode.InvalidParams, 'Function Group is required');
    }

    handlerLogger.info(`Reading function group ${args.function_group}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readFunctionGroup(args.function_group);
    handlerLogger.debug(`Successfully read function group ${args.function_group}`);
    return {
      isError: false,
      content: [{ type: "json", json: result }],
    };
  } catch (error) {
    handlerLogger.error(`Failed to read function group ${args?.function_group || ''}`, error as any);
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
