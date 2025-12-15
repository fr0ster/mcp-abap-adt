import { McpError, ErrorCode } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "GetFunction",
  description: "[read-only] Retrieve ABAP Function Module source code.",
  inputSchema: {
    function_name: z.string().describe("Name of the function module"),
    function_group: z.string().describe("Name of the function group")
  }
} as const;

export async function handleGetFunction(connection: AbapConnection, args: any) {
  if (!args?.function_name || !args?.function_group) {
    throw new McpError(ErrorCode.InvalidParams, 'Function name and group are required');
  }

  // Create client
  const client = new ReadOnlyClient(connection);
  const result = await client.readFunctionModule(args.function_name, args.function_group);
  return {
    content: [{ type: "json", json: result }],
  };
}
