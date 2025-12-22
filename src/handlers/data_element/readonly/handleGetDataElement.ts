import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import * as z from 'zod';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ErrorCode, McpError } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetDataElement',
  description:
    '[read-only] Retrieve ABAP data element information including type definition, field labels, and metadata from SAP system via ADT API.',
  inputSchema: {
    data_element_name: z
      .string()
      .describe('Data element name (e.g., MAKTX, MATNR, ZZ_E_TEST_001)'),
  },
} as const;

export async function handleGetDataElement(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  try {
    if (!args?.data_element_name) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Data element name is required',
      );
    }

    logger?.info(`Reading data element ${args.data_element_name}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readDataElement(args.data_element_name);
    logger?.debug(`Successfully read data element ${args.data_element_name}`);
    return {
      isError: false,
      content: [{ type: 'json', json: result }],
    };
  } catch (error) {
    logger?.error(
      `Failed to read data element ${args?.data_element_name || ''}`,
      error as any,
    );
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}
