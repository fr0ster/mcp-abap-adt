import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import type { AnswerDetail } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUtils } from '../../../lib/strategies/resultSets';
import type { SqlPreview } from '../../../lib/strategies/sqlPreview';
import { return_error } from '../../../lib/utils';
import type { SqlQueryResponse } from '../../system/readonly/handleGetSqlQuery';

export const TOOL_DEFINITION = {
  name: 'GetTableContents',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieve contents (data preview) of an ABAP database table or CDS view. Returns rows of data like SE16/SE16N.',
  inputSchema: {
    table_name: z.string().describe('Name of the ABAP table'),
    max_rows: z
      .number()
      .optional()
      .describe('Maximum number of rows to retrieve'),
    // This tool's `inputSchema` is a bare zod raw shape (`scripts/list-tools.ts`
    // reads that shape's optionality off `.isOptional()`), not the
    // `{type:'object', properties, required}` JSON Schema `DETAIL_PROPERTY`
    // (from `lib/strategies/detail.ts`) is written for — spreading it here
    // compiles (both are plain objects) but is not a zod type, so the tool
    // surface reads it as "required: unknown" rather than optional. Written
    // out as zod instead, kept to the same three values/default/wording.
    detail: z
      .enum(['terse', 'full', 'raw'])
      .optional()
      .default('terse')
      .describe(
        'How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).',
      ),
  },
} as const;

export async function handleGetTableContents(
  context: HandlerContext,
  args: { table_name: string; max_rows?: number; detail?: AnswerDetail },
) {
  const { connection, logger } = context;
  if (!args?.table_name) {
    return return_error('Table name is required');
  }

  const tableName = args.table_name;
  const maxRows = args.max_rows || 100;
  const detail = detailOf(args);

  logger?.info(`Reading table contents: ${tableName} (max_rows=${maxRows})`);

  // `IGetTableContentsParams.sql_query` is required since adt-clients 42.0.0 —
  // the caller states the statement, it is not built server-side from the
  // table's columns any more (see the type's own doc). The pre-migration call
  // never sent one; sending `SELECT * FROM <table>` here is not a new
  // capability, it is naming what this tool's own success label
  // ("SELECT * FROM ${tableName}") already assumed was being run.
  const sqlQuery = `SELECT * FROM ${tableName}`;

  // `getTableContents(params)` takes no options object at all — no `analyse`
  // to pass, matching the brief.
  return answer(
    { tool: 'GetTableContents', detail },
    () =>
      createAdtClient(connection, logger).getUtils(ourUtils).getTableContents({
        table_name: tableName,
        max_rows: maxRows,
        sql_query: sqlQuery,
      }),
    (reading: AdtReading<SqlPreview>) => {
      if (detail === 'raw') return reading.raw;
      const preview = reading.value;
      logger?.debug(
        `Parsed table data: rows=${preview.rows.length}/${preview.total_rows ?? 0}, columns=${preview.columns.length}`,
      );
      const answered: SqlQueryResponse = {
        sql_query: sqlQuery,
        row_number: maxRows,
        execution_time: preview.execution_time,
        total_rows: preview.total_rows,
        columns: preview.columns,
        rows: preview.rows,
      };
      // **`full` is the whole parse, and `terse` the fields you act on.**
      // These two were identical for a moment, which quietly took away what
      // the generic parse used to carry here — the statement ADT actually ran
      // and the analytical-view flag. `detail` may not cost a caller a field.
      return detail === 'full'
        ? {
            ...answered,
            executed_query_string: preview.executed_query_string,
            is_hana_analytical_view: preview.is_hana_analytical_view,
          }
        : answered;
    },
  );
}
