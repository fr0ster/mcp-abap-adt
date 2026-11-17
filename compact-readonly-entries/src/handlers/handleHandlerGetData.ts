import { handlerGetDataWithSqlDefinition } from '@mcp-abap-adt/lib/compact-shared';
import {
  defineTool,
  type HandlerContext,
  stated,
} from '@mcp-abap-adt/lib/handlers';
import {
  handleGetSqlQuery,
  handleGetTableContents,
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerGetData',
  available_in: ['onprem', 'cloud'] as const,
  ...handlerGetDataWithSqlDefinition(),
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

type HandlerGetDataArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * `sql_query` when stated, else the table `object_name` names. The schema
 * holds the rule: one of them is stated.
 */
export async function handleHandlerGetData(
  context: HandlerContext,
  args: HandlerGetDataArgs,
) {
  const maxRows = args.max_rows ?? 100;
  if (stated(args.sql_query)) {
    return sqlQuery(context, {
      sql_query: args.sql_query,
      row_number: maxRows,
    });
  }
  return tableContents(context, {
    table_name: args.object_name,
    max_rows: maxRows,
  });
}
