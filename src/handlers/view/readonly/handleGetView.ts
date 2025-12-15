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
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "GetView",
  description: "[read-only] Retrieve ABAP database view definition including tables, fields, joins, and selection conditions.",
  inputSchema: {
    view_name: z.string().describe("Name of the ABAP database view"),
    filePath: z.string().optional().describe("Optional file path to write the result to")
  }
} as const;

export async function handleGetView(connection: AbapConnection, args: any) {
  const handlerLogger = getHandlerLogger(
    'handleGetView',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  try {
    if (!args?.view_name) {
      throw new McpError(ErrorCode.InvalidParams, 'View name is required');
    }

    handlerLogger.info(`Reading view ${args.view_name}`);

    // Create client
    const client = new ReadOnlyClient(connection);
    const result = await client.readView(args.view_name);
    handlerLogger.debug(`Successfully read view ${args.view_name}`);
    return {
      isError: false,
      content: [{ type: "json", json: result }],
    };
  } catch (error) {
    handlerLogger.error(`Failed to read view ${args?.view_name || ''}`, error as any);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }
}
