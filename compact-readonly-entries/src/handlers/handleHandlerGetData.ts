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
 * `sql_query` when stated, else the table `object_name` names, at the
 * `detail` asked. The schema holds the rule: one of them is stated.
 */
export async function handleHandlerGetData(
  context: HandlerContext,
  args: HandlerGetDataArgs,
) {
  // The consumer's bound, forwarded as given; none given, none forwarded
  // (SAP's own applies). The level asked, forwarded: each read answers it as
  // its own tool does.
  const maxRows = args.max_rows;
  const detail = args.detail === undefined ? {} : { detail: args.detail };
  if (stated(args.sql_query)) {
    return sqlQuery(context, {
      sql_query: args.sql_query,
      ...(maxRows === undefined ? {} : { row_number: maxRows }),
      ...detail,
    });
  }
  return tableContents(context, {
    table_name: args.object_name,
    ...(maxRows === undefined ? {} : { max_rows: maxRows }),
    ...detail,
  });
}
