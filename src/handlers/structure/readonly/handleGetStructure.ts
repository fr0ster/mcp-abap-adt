import { McpError, ErrorCode, logger as baseLogger } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "GetStructure",
  description: "[read-only] Retrieve ABAP Structure.",
  inputSchema: {
    structure_name: z.string().describe("Name of the ABAP Structure")
  }
} as const;

export async function handleGetStructure(connection: AbapConnection, args: any) {
  const handlerLogger = getHandlerLogger(
    'handleGetStructure',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  try {
    if (!args?.structure_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Structure name is required');
    }

    handlerLogger.info(`Reading structure ${args.structure_name}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readStructure(args.structure_name);
    handlerLogger.debug(`Successfully read structure ${args.structure_name}`);
    return {
      isError: false,
      content: [{ type: "json", json: result }],
    };
  } catch (error) {
    handlerLogger.error(`Failed to read structure ${args?.structure_name || ''}`, error as any);
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
