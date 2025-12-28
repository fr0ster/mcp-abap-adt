import * as z from 'zod';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ErrorCode, McpError } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetTableContents',
  description: '[read-only] Retrieve contents of an ABAP table.',
  inputSchema: {
    table_name: z.string().describe('Name of the ABAP table'),
    max_rows: z
      .number()
      .optional()
      .describe('Maximum number of rows to retrieve'),
  },
} as const;

export async function handleGetTableContents(
  _context: HandlerContext,
  args: any,
) {
  if (!args?.table_name) {
    throw new McpError(ErrorCode.InvalidParams, 'Table name is required');
  }

  // TODO: Implement using AdtClient.readTableContents() when method is added
  throw new McpError(
    ErrorCode.InternalError,
    'GetTableContents is temporarily unavailable. Method will be added to AdtClient soon.',
  );
}
