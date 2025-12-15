import { McpError, ErrorCode } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "GetTable",
  description: "[read-only] Retrieve ABAP table structure.",
  inputSchema: {
    table_name: z.string().describe("Name of the ABAP table")
  }
} as const;

export async function handleGetTable(connection: AbapConnection, args: any) {
  if (!args?.table_name) {
    throw new McpError(ErrorCode.InvalidParams, 'Table name is required');
  }

  // Create client
  const client = new ReadOnlyClient(connection);
  let result = await client.readTable(args.table_name);
  return {
    content: [{ type: "json", json: result }],
  };
}
