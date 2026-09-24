import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import type { AnswerDetail } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUtils } from '../../../lib/strategies/resultSets';
import type { SqlPreview } from '../../../lib/strategies/sqlPreview';
import { return_error } from '../../../lib/utils';

/**
 * The answer's shape, shared with `GetTableContents`, which reads the same
 * `/datapreview/freestyle` document for a whole table.
 *
 * The parse behind it is `sqlPreview` (`lib/strategies/sqlPreview.ts`),
 * injected on the `query` and `contents` slots. It used to be a set of
 * regular expressions here, with the handler projecting `reading.raw` past
 * the result set so they could keep running — see that file for what that
 * cost.
 */
export interface SqlQueryResponse {
  sql_query: string;
  row_number: number;
  execution_time?: number;
  total_rows?: number;
  columns: Array<{ name: string; type: string; description?: string }>;
  rows: Array<Record<string, string | null>>;
  /**
   * `detail: 'full'` only — the whole document, parsed generically, so
   * nothing the rows do not need is dropped on the way.
   */
  document?: unknown;
}

export const TOOL_DEFINITION = {
  name: 'GetSqlQuery',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Execute ABAP SQL SELECT queries on database tables and CDS views via SAP ADT Data Preview API. Use for ad-hoc data retrieval, row counts, and filtered queries.',
  inputSchema: {
    type: 'object',
    properties: {
      sql_query: {
        type: 'string',
        description: 'SQL query to execute',
      },
      row_number: {
        type: 'number',
        description: '[read-only] Maximum number of rows to return',
        default: 100,
      },
      ...DETAIL_PROPERTY,
    },
    required: ['sql_query'],
  },
} as const;

export async function handleGetSqlQuery(
  context: HandlerContext,
  args: { sql_query: string; row_number?: number; detail?: AnswerDetail },
) {
  const { connection, logger } = context;
  logger?.info('handleGetSqlQuery called');

  if (!args?.sql_query) {
    return return_error('SQL query is required');
  }

  const sqlQuery = args.sql_query;
  const rowNumber = args.row_number || 100; // Default to 100 rows if not specified
  const detail = detailOf(args);

  logger?.info(`Executing SQL query (rows=${rowNumber})`);

  // `getSqlQuery(params)` takes no options object at all — no `analyse` to
  // pass, matching the brief.
  return answer(
    { tool: 'GetSqlQuery', detail },
    () =>
      createAdtClient(connection, logger)
        .getUtils(ourUtils)
        .getSqlQuery({ sql_query: sqlQuery, row_number: rowNumber }),
    (reading: AdtReading<SqlPreview>) => {
      if (detail === 'raw') return reading.raw;
      const preview = reading.value;
      logger?.debug(
        `Parsed SQL query data: rows=${preview.rows.length}/${preview.total_rows ?? 0}, columns=${preview.columns.length}`,
      );
      const answered: SqlQueryResponse = {
        sql_query: sqlQuery,
        row_number: rowNumber,
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
