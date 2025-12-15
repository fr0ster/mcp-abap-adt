import { McpError, ErrorCode, logger as baseLogger } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "GetClass",
  description: "[read-only] Retrieve ABAP class source code.",
  inputSchema: {
    class_name: z.string().describe("Name of the ABAP class")
  }
} as const;

export async function handleGetClass(connection: AbapConnection, args: any) {
  const handlerLogger = getHandlerLogger(
    'handleGetClass',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  try {
    if (!args?.class_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Class name is required');
    }

    handlerLogger.info(`Reading class ${args.class_name}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readClass(args.class_name);
    handlerLogger.debug(`Successfully read class ${args.class_name}`);
    return {
      isError: false,
      content: [{ type: "json", json: result }],
    };
  } catch (error) {
    handlerLogger.error(`Failed to read class ${args?.class_name || ''}`, error as any);
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
