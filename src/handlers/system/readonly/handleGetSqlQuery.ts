import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  longRunning,
  purpose,
  sapRowBound,
  toolDescription,
} from '../../../lib/description';
import {
  about,
  type Column,
  type Head,
  headShape,
  type ListAnswerTable,
  listAnswerAt,
  type RowSchemas,
  rows,
  writeListing,
  writeWhole,
} from '../../../lib/detail';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { LONG_BACKGROUND_FIELD } from '../../../lib/longTools';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUtils } from '../../../lib/strategies/resultSets';
import type { SqlPreview } from '../../../lib/strategies/sqlPreview';
import type { XmlRead } from '../../../lib/xml/tree';

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
  /** The bound the consumer gave; absent when none was given, SAP's own then applies. */
  row_number?: number | undefined;
  execution_time?: number | undefined;
  total_rows?: number | undefined;
  /** How many records are listed in `rows`. */
  rows_listed: number;
  /**
   * What cut the list, present when it holds fewer records than
   * `total_rows`: the bound given (`row_number 50`), or SAP when none was.
   */
  cut_by?: string | undefined;
  columns: Array<{ name: string; type: string; description?: string }>;
  rows: Array<Record<string, string | null>>;
  /**
   * `detail: 'full'` only — the whole document, parsed generically, so
   * nothing the rows do not need is dropped on the way.
   */
  document?: XmlRead | undefined;
}

/**
 * The row bound's parameter description, shared by the data tools. `0` and a
 * negative bound were refused `400` by SAP, and the largest accepted was
 * 2147483646 (BTP ABAP environment, 2026-11-27).
 */
export const ROW_BOUND_WORDS =
  '[read-only] Most records to read. Absent: SAP gives at most 100.';

export const TOOL_DEFINITION = {
  name: 'GetSqlQuery',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads the data an ABAP SQL SELECT selects from database tables and CDS views, up to the number of records asked.',
    ),
    notes: [sapRowBound, longRunning],
  }),
  inputSchema: z.object({
    background: LONG_BACKGROUND_FIELD,
    sql_query: requiredText('SQL query is required').describe(
      'SQL query to execute',
    ),
    row_number: z.number().optional().describe(ROW_BOUND_WORDS),
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleGetSqlQuery(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const { connection, logger } = context;
  logger?.info('handleGetSqlQuery called');

  const sqlQuery = args.sql_query;
  // The consumer's bound as given, `0` included; none given, none sent
  // (SAP's own applies: `sapRowBound`).
  const rowNumber = args.row_number;
  const detail = detailOf(args);

  logger?.info(`Executing SQL query (rows=${rowNumber ?? 'SAP default'})`);

  // `getSqlQuery(params, options?)` takes `analyseException` since
  // adt-clients 23.
  return answer(
    { tool: 'GetSqlQuery', detail },
    () =>
      withAdtHeaders(context, 'utils.getSqlQuery', (headers) =>
        createAdtClient(connection, logger)
          .getUtils(ourUtils)
          .getSqlQuery(rowBoundQuery(sqlQuery, rowNumber), {
            headers,
            analyse: analyseException,
          }),
      ),
    (reading) => {
      logger?.debug(
        `Parsed SQL query data: rows=${reading.value.rows.length}/${reading.value.total_rows ?? 0}, columns=${reading.value.columns.length}`,
      );
      return listAnswerAt(
        DATA_ANSWERS,
        levelOf(args),
      )({
        sqlQuery,
        rowNumber,
        boundName: 'row_number',
        reading,
      });
    },
  );
}

/** The data preview's parameters: the statement, and the consumer's bound only when given. */
export function rowBoundQuery(
  sqlQuery: string,
  rowNumber: number | undefined,
): { sql_query: string; row_number?: number } {
  return rowNumber === undefined
    ? { sql_query: sqlQuery }
    : { sql_query: sqlQuery, row_number: rowNumber };
}

/**
 * What cut the list, when it holds fewer records than the selection: the
 * bound given, by the parameter it was given as, or SAP when none was.
 */
function cutOf({
  rowNumber,
  boundName,
  reading,
}: DataRead): string | undefined {
  const preview = reading.value;
  if (
    preview.total_rows === undefined ||
    preview.rows.length >= preview.total_rows
  ) {
    return undefined;
  }
  return rowNumber === undefined
    ? `SAP: no ${boundName} given`
    : `${boundName} ${rowNumber}`;
}

/**
 * What a data read answers from: the statement sent, the bound given and
 * the parameter it was given as, and the reading.
 */
export interface DataRead {
  readonly sqlQuery: string;
  readonly rowNumber: number | undefined;
  readonly boundName: 'row_number' | 'max_rows';
  readonly reading: AdtReading<SqlPreview>;
}

/** One record of the selection: its value per column name, a blank cell `null`. */
type DataRecord = Readonly<Record<string, string | null>>;

/** What the data listing writes: a row per record. */
interface DataListing {
  readonly records: readonly DataRecord[];
}

/** A column of the selection as a terse column: its name, the record's value (a blank cell empty). */
function dataColumnOf(name: string): Column<DataRecord> {
  return { name, cell: (record) => record[name] ?? '' };
}

/** The lists the data listing writes: a row per record, under the column names. */
function dataLists(columns: readonly string[]): RowSchemas<DataListing> {
  return {
    records: about(
      'for each record, its value in each column',
      rows('records', {
        columns: columns.map(dataColumnOf),
        header: 'always',
      }),
    ),
  };
}

/** The head the data listing opens with. */
export const DATA_HEADS = [
  headShape(
    'total_rows',
    'how many records the selection holds, when SAP reports it',
  ),
  headShape(
    'rows',
    'when fewer records are listed than the selection holds: how many are listed, of how many, and what cut them',
  ),
];

/** The answer of a data read before `detail` shaped it: the rows, and each column's type and description. */
function dataAnswerOf(read: DataRead) {
  const { sqlQuery, rowNumber, reading } = read;
  const preview = reading.value;
  const cut = cutOf(read);
  return {
    sql_query: sqlQuery,
    ...(rowNumber === undefined ? {} : { row_number: rowNumber }),
    execution_time: preview.execution_time,
    total_rows: preview.total_rows,
    rows_listed: preview.rows.length,
    ...(cut === undefined ? {} : { cut_by: cut }),
    columns: preview.columns,
    rows: preview.rows,
  } satisfies SqlQueryResponse;
}

/**
 * What a data read answers at each `detail` (`src/lib/detail`), shared by
 * `GetSqlQuery` and `GetTableContents`, which read the same document: terse
 * a row per record under the column names, after how many records the
 * selection holds when SAP reports it (`# total_rows`, absent when it does
 * not — the record count never stands in) and, when SAP answered fewer, how
 * many are listed, of how many, and what cut them (`# rows 50 of 899, cut at
 * row_number 50`), written by the listing writer; medium the rows with each
 * column's type and description; full that with the whole document parsed
 * beside it (`keyAttribute`, `colType`, `isKeyFigure` and whatever SAP adds
 * next); raw the document as SAP sent it.
 */
export const DATA_ANSWERS: ListAnswerTable<
  DataRead,
  string | SqlQueryResponse
> = {
  terse: (read) => {
    const preview = read.reading.value;
    const cut = cutOf(read);
    const heads: Head[] = [
      ...(preview.total_rows === undefined
        ? []
        : [{ head: 'total_rows', value: String(preview.total_rows) }]),
      ...(cut === undefined
        ? []
        : [
            {
              head: 'rows',
              value: `${preview.rows.length} of ${preview.total_rows}, ${
                read.rowNumber === undefined ? 'cut by ' : 'cut at '
              }${cut}`,
            },
          ]),
    ];
    return writeListing({
      heads,
      reading: { records: preview.rows },
      lists: dataLists(preview.columns.map((column) => column.name)),
    });
  },
  medium: (read) => writeWhole(dataAnswerOf(read)),
  full: (read) => ({
    ...dataAnswerOf(read),
    document: read.reading.value.document,
  }),
  raw: ({ reading }) => reading.raw,
};
