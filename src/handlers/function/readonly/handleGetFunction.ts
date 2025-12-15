import { McpError, ErrorCode, logger as baseLogger } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "GetFunction",
  description: "[read-only] Retrieve ABAP Function Module source code.",
  inputSchema: {
    function_name: z.string().describe("Name of the function module"),
    function_group: z.string().describe("Name of the function group")
  }
} as const;

export async function handleGetFunction(connection: AbapConnection, args: any) {
  const handlerLogger = getHandlerLogger(
    'handleGetFunction',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  try {
    if (!args?.function_name || !args?.function_group) {
      throw new McpError(ErrorCode.InvalidParams, 'Function name and group are required');
    }

    handlerLogger.info(`Reading function module ${args.function_name} in group ${args.function_group}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readFunctionModule(args.function_name, args.function_group);
    handlerLogger.debug(`Successfully read function module ${args.function_name}`);
    return {
      isError: false,
      content: [{ type: "json", json: result }],
    };
  } catch (error) {
    handlerLogger.error(`Failed to read function module ${args?.function_name || ''}`, error as any);
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
