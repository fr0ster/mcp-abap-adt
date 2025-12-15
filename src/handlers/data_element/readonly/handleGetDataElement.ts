import { McpError, ErrorCode, logger as baseLogger } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "GetDataElement",
  description: "[read-only] Retrieve ABAP data element information including type definition, field labels, and metadata from SAP system via ADT API.",
  inputSchema: {
    data_element_name: z.string().describe("Data element name (e.g., MAKTX, MATNR, ZZ_E_TEST_001)")
  }
} as const;

export async function handleGetDataElement(connection: AbapConnection, args: any) {
  const handlerLogger = getHandlerLogger(
    'handleGetDataElement',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  try {
    if (!args?.data_element_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Data element name is required');
    }

    handlerLogger.info(`Reading data element ${args.data_element_name}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readDataElement(args.data_element_name);
    handlerLogger.debug(`Successfully read data element ${args.data_element_name}`);
    return {
      isError: false,
      content: [{ type: "json", json: result }],
    };
  } catch (error) {
    handlerLogger.error(`Failed to read data element ${args?.data_element_name || ''}`, error as any);
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
