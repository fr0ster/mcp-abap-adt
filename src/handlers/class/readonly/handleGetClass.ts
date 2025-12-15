import { McpError, ErrorCode, logger as baseLogger } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "GetClass",
  description: "[read-only] Retrieve ABAP class source code.",
  inputSchema: {
    class_name: z.string().describe("Name of the ABAP class")
  }
} as const;

export async function handleGetClass(connection: AbapConnection, args: any) {
  if (!args?.class_name) {
    throw new McpError(ErrorCode.InvalidParams, 'Class name is required');
  }

  // Create client
  const client = new ReadOnlyClient(connection);
  return await client.readClass(args.class_name);
}
