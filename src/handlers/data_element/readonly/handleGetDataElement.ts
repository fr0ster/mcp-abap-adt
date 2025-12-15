import { McpError, ErrorCode } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "GetDataElement",
  description: "[read-only] Retrieve ABAP data element information including type definition, field labels, and metadata from SAP system via ADT API.",
  inputSchema: {
    data_element_name: z.string().describe("Data element name (e.g., MAKTX, MATNR, ZZ_E_TEST_001)")
  }
} as const;

export async function handleGetDataElement(connection: AbapConnection, args: any) {
  if (!args?.data_element_name) {
    throw new McpError(ErrorCode.InvalidParams, 'Data element name is required');
  }

  // Create client
  const client = new ReadOnlyClient(connection);
  return await client.readDataElement(args.data_element_name);
}
