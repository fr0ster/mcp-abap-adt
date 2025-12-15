import { McpError, ErrorCode } from '../../../lib/utils';
import * as z from 'zod';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "GetProgram",
  description: "[read-only] Retrieve ABAP program source code. Returns only the main program source code without includes or enhancements.",
  inputSchema: {
    program_name: z.string().describe("Name of the ABAP program")
  }
} as const;

export async function handleGetProgram(context: HandlerContext, args: any) {
  const { logger } = context;
  try {
    if (!args?.program_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Program name is required');
    }

    logger.info(`Reading program ${args.program_name}`);

    // Create client
    const client = new ReadOnlyClient(context.connection);
    const result = await client.readProgram(args.program_name);
    logger.debug(`Successfully read program ${args.program_name}`);
    return {
      isError: false,
      content: [{ type: "json", json: result }],
    };
  } catch (error) {
    logger.error(`Failed to read program ${args?.program_name || ''}`, error as any);
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
