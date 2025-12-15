import { McpError, ErrorCode } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "GetStructure",
  description: "[read-only] Retrieve ABAP Structure.",
  inputSchema: {
    structure_name: z.string().describe("Name of the ABAP Structure")
  }
} as const;

export async function handleGetStructure(connection: AbapConnection, args: any) {
  if (!args?.structure_name) {
    throw new McpError(ErrorCode.InvalidParams, 'Structure name is required');
  }

  // Create client
  const client = new ReadOnlyClient(connection);
  const result = await client.readStructure(args.structure_name);
  return {
    content: [{ type: "json", json: result }],
  };
}
