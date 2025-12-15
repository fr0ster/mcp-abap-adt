import { McpError, ErrorCode } from '../../../lib/utils';
import * as z from 'zod';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "GetDomain",
  description: "[read-only] Retrieve ABAP domain structure and properties from SAP system.",
  inputSchema: {
    domain_name: z.string().describe("Domain name (e.g., MATNR, CHAR20, ZZ_TEST_DOMAIN)")
  }
} as const;

export async function handleGetDomain(connection: AbapConnection, args: any) {
  if (!args?.domain_name) {
    throw new McpError(ErrorCode.InvalidParams, 'Domain name is required');
  }

  // Create client
  const client = new ReadOnlyClient(connection);
  return await client.readDomain(args.domain_name);
}
