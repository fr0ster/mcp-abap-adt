import { McpError, ErrorCode } from '../../../lib/utils';
import * as z from 'zod';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "GetStructure",
  description: "[read-only] Retrieve ABAP Structure.",
  inputSchema: {
    structure_name: z.string().describe("Name of the ABAP Structure")
  }
} as const;

export async function handleGetStructure(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  try {
    if (!args?.structure_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Structure name is required');
    }

    logger.info(`Reading structure ${args.structure_name}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readStructure(args.structure_name);
    logger.debug(`Successfully read structure ${args.structure_name}`);
    return {
      isError: false,
      content: [{ type: "json", json: result }],
    };
  } catch (error) {
    logger.error(`Failed to read structure ${args?.structure_name || ''}`, error as any);
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
