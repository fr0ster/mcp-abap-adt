import { McpError, ErrorCode } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "GetInterface",
  description: "[read-only] Retrieve ABAP interface source code.",
  inputSchema: {
    interface_name: z.string().describe("Name of the ABAP interface")
  }
} as const;

export async function handleGetInterface(connection: AbapConnection, args: any) {
  if (!args?.interface_name) {
    throw new McpError(ErrorCode.InvalidParams, 'Interface name is required');
  }

  // Create client
  const client = new ReadOnlyClient(connection);
  return await client.readInterface(args.interface_name);
}
