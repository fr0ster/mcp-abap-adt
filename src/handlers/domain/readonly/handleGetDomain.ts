import { McpError, ErrorCode, logger as baseLogger } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "GetDomain",
  description: "[read-only] Retrieve ABAP domain structure and properties from SAP system.",
  inputSchema: {
    domain_name: z.string().describe("Domain name (e.g., MATNR, CHAR20, ZZ_TEST_DOMAIN)")
  }
} as const;

export async function handleGetDomain(connection: AbapConnection, args: any) {
  const handlerLogger = getHandlerLogger(
    'handleGetDomain',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  try {
    if (!args?.domain_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Domain name is required');
    }

    handlerLogger.info(`Reading domain ${args.domain_name}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readDomain(args.domain_name);
    handlerLogger.debug(`Successfully read domain ${args.domain_name}`);
    return {
      isError: false,
      content: [{ type: "json", json: result }],
    };
  } catch (error) {
    handlerLogger.error(`Failed to read domain ${args?.domain_name || ''}`, error as any);
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
