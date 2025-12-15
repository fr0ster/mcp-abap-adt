import { McpError, ErrorCode } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "GetFunctionGroup",
  description: "[read-only] Retrieve ABAP Function Group source code.",
  inputSchema: {
    function_group: z.string().describe("Name of the function group")
  }
} as const;

export async function handleGetFunctionGroup(connection: AbapConnection, args: any) {
  if (!args?.function_group) {
    throw new McpError(ErrorCode.InvalidParams, 'Function Group is required');
  }

  // Create client
  const client = new ReadOnlyClient(connection);
  return await client.readFunctionGroup(args.function_group);
}
