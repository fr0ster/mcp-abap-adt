import { McpError, ErrorCode, logger as baseLogger } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "GetProgram",
  description: "[read-only] Retrieve ABAP program source code. Returns only the main program source code without includes or enhancements.",
  inputSchema: {
    program_name: z.string().describe("Name of the ABAP program")
  }
} as const;

export async function handleGetProgram(connection: AbapConnection, args: any) {
  const handlerLogger = getHandlerLogger(
    'handleGetProgram',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  try {
    if (!args?.program_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Program name is required');
    }

    handlerLogger.info(`Reading program ${args.program_name}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readProgram(args.program_name);
    handlerLogger.debug(`Successfully read program ${args.program_name}`);
    return {
      isError: false,
      content: [{ type: "json", json: result }],
    };
  } catch (error) {
    handlerLogger.error(`Failed to read program ${args?.program_name || ''}`, error as any);
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
