import {
  compactGetDataSchema,
  withLongToolAdvice,
} from '@mcp-abap-adt/lib/compact-shared';
import { defineTool, type HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleGetSqlQuery,
  handleGetTableContents,
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';
import { return_error } from '@mcp-abap-adt/lib/utils';

export const TOOL_DEFINITION = {
  name: 'HandlerGetData',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Reads the rows of the table or CDS view named by object_name, or the rows sql_query selects: every column of object_name, or what sql_query selects with its columns, conditions and order. Required: object_name or sql_query. Optional: max_rows (default 100). Response: JSON.',
  ),
  inputSchema: compactGetDataSchema,
} as const;

/** The two reads' entries: each one's schema parses its call. */
const sqlQuery = defineTool(
  READ_DEFINITIONS.GetSqlQuery,
  handleGetSqlQuery,
).call;
const tableContents = defineTool(
  READ_DEFINITIONS.GetTableContents,
  handleGetTableContents,
).call;

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
    return sqlQuery(context, {
      sql_query: args.sql_query,
      row_number: maxRows,
    });
  }
  if (args?.object_name) {
    return tableContents(context, {
      table_name: args.object_name,
      max_rows: maxRows,
    });
  }
  return return_error(new Error('object_name or sql_query is required'));
}
