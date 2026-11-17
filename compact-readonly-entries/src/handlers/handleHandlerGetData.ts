import { handlerGetDataWithSqlDefinition } from '@mcp-abap-adt/lib/compact-shared';
import {
  argumentsRefusalOf,
  defineTool,
  type HandlerContext,
  type HandlerEntry,
  invalidArgumentsWords,
  type ToolArgs,
} from '@mcp-abap-adt/lib/handlers';
import {
  handleGetSqlQuery,
  handleGetTableContents,
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';
import { return_error } from '@mcp-abap-adt/lib/utils';
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

/** The two reads' refusals of the arguments the call hands them. */
const sqlQueryRefusal = argumentsRefusalOf(READ_DEFINITIONS.GetSqlQuery);
const tableContentsRefusal = argumentsRefusalOf(
  READ_DEFINITIONS.GetTableContents,
);

/** The arguments `handleHandlerGetData` hands its read, or none. */
function readOf(
  args: HandlerGetDataArgs,
):
  | { read: 'sql'; args: { sql_query: string; row_number: number } }
  | { read: 'table'; args: { table_name: string; max_rows: number } }
  | undefined {
  const maxRows = args?.max_rows ?? 100;
  if (args?.sql_query) {
    return {
      read: 'sql',
      args: { sql_query: args.sql_query, row_number: maxRows },
    };
  }
  if (args?.object_name) {
    return {
      read: 'table',
      args: { table_name: args.object_name, max_rows: maxRows },
    };
  }
  return undefined;
}

const NOTHING_TO_READ = 'object_name or sql_query is required';

/**
 * The refusal a `HandlerGetData` call of `args` answers, read before the
 * call takes a connection: its own schema, the read it names, then that
 * read's schema (`undefined`: none).
 */
export function getDataArgumentsRefusal(args: ToolArgs): Error | undefined {
  const parsed = TOOL_DEFINITION.inputSchema.safeParse(args);
  if (!parsed.success) {
    return new Error(
      invalidArgumentsWords(TOOL_DEFINITION.name, parsed.error.issues),
    );
  }
  const read = readOf(parsed.data);
  if (read === undefined) return new Error(NOTHING_TO_READ);
  return read.read === 'sql'
    ? sqlQueryRefusal(read.args)
    : tableContentsRefusal(read.args);
}

/** `HandlerGetData`'s entry: its call, and its arguments' refusal before it. */
export function handlerGetDataEntry(): HandlerEntry {
  return {
    ...defineTool(TOOL_DEFINITION, handleHandlerGetData),
    refusesArguments: getDataArgumentsRefusal,
  };
}

export async function handleHandlerGetData(
  context: HandlerContext,
  args: HandlerGetDataArgs,
) {
  const read = readOf(args);
  if (read === undefined) return return_error(new Error(NOTHING_TO_READ));
  return read.read === 'sql'
    ? sqlQuery(context, read.args)
    : tableContents(context, read.args);
}
