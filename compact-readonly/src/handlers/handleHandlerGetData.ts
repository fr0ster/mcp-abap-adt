import { compactGetDataSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleGetSqlQuery,
  handleGetTableContents,
} from '@mcp-abap-adt/lib/handlers/read';
import { return_error } from '@mcp-abap-adt/lib/utils';

export const TOOL_DEFINITION = {
  name: 'HandlerGetData',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Read rows of a table or CDS view: every column of object_name, or what sql_query selects with its columns, conditions and order. Required: object_name or sql_query. Optional: max_rows (default 100). Response: JSON.',
  inputSchema: compactGetDataSchema,
} as const;

type HandlerGetDataArgs = {
  object_name?: string;
  sql_query?: string;
  max_rows?: number;
};

export async function handleHandlerGetData(
  context: HandlerContext,
  args: HandlerGetDataArgs,
) {
  const maxRows = args?.max_rows ?? 100;
  if (args?.sql_query) {
    return handleGetSqlQuery(context, {
      sql_query: args.sql_query,
      row_number: maxRows,
    } as never);
  }
  if (args?.object_name) {
    return handleGetTableContents(context, {
      table_name: args.object_name,
      max_rows: maxRows,
    } as never);
  }
  return return_error(new Error('object_name or sql_query is required'));
}
