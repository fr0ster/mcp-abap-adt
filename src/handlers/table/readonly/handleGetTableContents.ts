import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { timeoutField, withLongToolAdvice } from '../../../lib/longTools';
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
  description: withLongToolAdvice(
    '[read-only] Reads the contents (data preview, like SE16/SE16N) of the ABAP database table or CDS view named by table_name: every column, up to max_rows rows (default 100). Answers sql_query, row_number (the max_rows asked), execution_time, total_rows (the rows the table or view holds), columns and rows.',
  ),
  inputSchema: {
    timeout: timeoutField(),
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

  const sqlQuery = `SELECT * FROM ${tableName}`;

  // **Read through the freestyle preview, not `/datapreview/ddic`.** Measured
  // on premise (BASIS 816, 2026-10-21): `/datapreview/ddic?rowNumber=N`
  // answers N+1 rows and `totalRows` 0, so a table of four rows asked for two
  // answered three and said it was empty. `/datapreview/freestyle?rowNumber=N`
  // with the same `SELECT * FROM <table>` answers exactly N rows (fewer when
  // the table holds fewer) and the true `totalRows` — the reading
  // `GetSqlQuery` already uses, so both tools answer one document the same
  // way.
  return answer(
    { tool: 'GetTableContents', detail },
    () =>
      withAdtHeaders(context, 'utils.getSqlQuery', (headers) =>
        createAdtClient(connection, logger)
          .getUtils(ourUtils)
          .getSqlQuery(
            { sql_query: sqlQuery, row_number: maxRows },
            { headers, analyse: analyseException },
          ),
      ),
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
      // These two were identical for a moment, which took away everything the
      // generic parse used to carry here — and naming two of the missing
      // fields, as the next attempt did, still left `keyAttribute`,
      // `colType`, `isKeyFigure` and whatever SAP adds next outside an answer
      // that called itself full. So `full` is the document's own parse,
      // beside the rows this reading exists to get right.
      return detail === 'full'
        ? { ...answered, document: preview.document }
        : answered;
    },
  );
}
