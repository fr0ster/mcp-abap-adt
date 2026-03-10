import * as z from 'zod';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ErrorCode, McpError } from '../../../lib/utils';
import { parseSqlQueryXml } from '../../system/readonly/handleGetSqlQuery';

export const TOOL_DEFINITION = {
  name: 'GetTableContents',
  available_in: ['onprem', 'cloud'] as const,
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
  context: HandlerContext,
  args: any,
) {
  const { connection, logger } = context;
  try {
    if (!args?.table_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Table name is required');
    }

    const tableName = args.table_name;
    const maxRows = args.max_rows || 100;

    logger?.info(`Reading table contents: ${tableName} (max_rows=${maxRows})`);

    const client = createAdtClient(connection, logger);
    const response = await client
      .getUtils()
      .getTableContents({ table_name: tableName, max_rows: maxRows });

    if (response.status === 200 && response.data) {
      logger?.info('Table contents request completed successfully');

      const parsedData = parseSqlQueryXml(
        response.data,
        `SELECT * FROM ${tableName}`,
        maxRows,
        logger,
      );

      logger?.debug(
        `Parsed table data: rows=${parsedData.rows.length}/${parsedData.total_rows ?? 0}, columns=${parsedData.columns.length}`,
      );

      return {
        isError: false,
        content: [
          {
            type: 'text',
            text: JSON.stringify(parsedData, null, 2),
          },
        ],
      };
    } else {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to read table contents. Status: ${response.status}`,
      );
    }
  } catch (error) {
    logger?.error('Failed to read table contents', error as any);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `ADT error: ${String(error)}`,
        },
      ],
    };
  }
}
