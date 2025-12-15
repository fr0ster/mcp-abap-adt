import { McpError, ErrorCode, logger as baseLogger } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "GetInterface",
  description: "[read-only] Retrieve ABAP interface source code.",
  inputSchema: {
    interface_name: z.string().describe("Name of the ABAP interface")
  }
} as const;

export async function handleGetInterface(connection: AbapConnection, args: any) {
  const handlerLogger = getHandlerLogger(
    'handleGetInterface',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  try {
    if (!args?.interface_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Interface name is required');
    }

    handlerLogger.info(`Reading interface ${args.interface_name}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readInterface(args.interface_name);
    handlerLogger.debug(`Successfully read interface ${args.interface_name}`);
    return {
      isError: false,
      content: [{ type: "json", json: result }],
    };
  } catch (error) {
    handlerLogger.error(`Failed to read interface ${args?.interface_name || ''}`, error as any);
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
