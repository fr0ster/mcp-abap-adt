/**
 * GetView Handler - ABAP Database View Retrieval via ADT API
 *
 * APPROACH:
 * - Similar to GetTable pattern: GET request to retrieve view definition
 * - View-specific XML structure with ddic:view namespace
 * - Parse tables, fields, joins, and selection conditions
 * - Support for both normal views and maintenance views
 */

import { McpError, ErrorCode, logger as baseLogger } from '../../../lib/utils';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import * as z from 'zod';

export const TOOL_DEFINITION = {
  name: "GetView",
  description: "[read-only] Retrieve ABAP database view definition including tables, fields, joins, and selection conditions.",
  inputSchema: {
    view_name: z.string().describe("Name of the ABAP database view"),
    filePath: z.string().optional().describe("Optional file path to write the result to")
  }
} as const;

export async function handleGetView(connection: AbapConnection, args: any) {
  if (!args?.view_name) {
    throw new McpError(ErrorCode.InvalidParams, 'View name is required');
  }

  // Create client
  const client = new ReadOnlyClient(connection);
  const view = await client.readView(args.view_name);
  return view;
}
