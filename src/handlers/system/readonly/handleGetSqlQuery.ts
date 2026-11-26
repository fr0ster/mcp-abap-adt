import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  longRunning,
  purpose,
  toolDescription,
} from '../../../lib/description';
import {
  about,
  type Column,
  type DetailLevel,
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
  row_number: number;
  execution_time?: number | undefined;
  total_rows?: number | undefined;
  columns: Array<{ name: string; type: string; description?: string }>;
  rows: Array<Record<string, string | null>>;
  /**
   * `detail: 'full'` only — the whole document, parsed generically, so
   * nothing the rows do not need is dropped on the way.
   */
  document?: XmlRead | undefined;
}

export const TOOL_DEFINITION = {
  name: 'GetSqlQuery',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads the data an ABAP SQL SELECT selects from database tables and CDS views, up to the number of records asked.',
    ),
    notes: [longRunning],
  }),
  inputSchema: z.object({
    background: LONG_BACKGROUND_FIELD,
    sql_query: requiredText('SQL query is required').describe(
      'SQL query to execute',
    ),
    row_number: z
      .number()
      .default(100)
      .optional()
      .describe('[read-only] Maximum number of rows to return'),
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
  const rowNumber = args.row_number || 100; // Default to 100 rows if not specified
  const detail = detailOf(args);

  logger?.info(`Executing SQL query (rows=${rowNumber})`);

  // `getSqlQuery(params, options?)` takes `analyseException` since
  // adt-clients 23.
  return answer(
    { tool: 'GetSqlQuery', detail },
    () =>
      withAdtHeaders(context, 'utils.getSqlQuery', (headers) =>
        createAdtClient(connection, logger)
          .getUtils(ourUtils)
          .getSqlQuery(
            { sql_query: sqlQuery, row_number: rowNumber },
            { headers, analyse: analyseException },
          ),
      ),
    (reading) => {
      logger?.debug(
        `Parsed SQL query data: rows=${reading.value.rows.length}/${reading.value.total_rows ?? 0}, columns=${reading.value.columns.length}`,
      );
      return dataAnswerAt(levelOf(args))({
        sqlQuery,
        rowNumber,
        reading,
      });
    },
  );
}

/** What a data read answers from: the statement sent, the rows asked, and the reading. */
export interface DataRead {
  readonly sqlQuery: string;
  readonly rowNumber: number;
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
  headShape('total_rows', 'how many records the selection holds'),
];

/** The answer of a data read before `detail` shaped it: the rows, and each column's type and description. */
function dataAnswerOf({ sqlQuery, rowNumber, reading }: DataRead) {
  const preview = reading.value;
  return {
    sql_query: sqlQuery,
    row_number: rowNumber,
    execution_time: preview.execution_time,
    total_rows: preview.total_rows,
    columns: preview.columns,
    rows: preview.rows,
  } satisfies SqlQueryResponse;
}

/**
 * What a data read answers at each `detail` (`src/lib/detail`), shared by
 * `GetSqlQuery` and `GetTableContents`, which read the same document: terse
 * a row per record under the column names, after how many records the
 * selection holds, written by the listing writer; medium the rows with each
 * column's type and description; full that with the whole document parsed
 * beside it (`keyAttribute`, `colType`, `isKeyFigure` and whatever SAP adds
 * next); raw the document as SAP sent it.
 */
const DATA_ANSWERS: ListAnswerTable<DataRead, string | SqlQueryResponse> = {
  terse: ({ reading }) => {
    const preview = reading.value;
    const heads: Head[] =
      preview.total_rows === undefined
        ? []
        : [{ head: 'total_rows', value: String(preview.total_rows) }];
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

/** The data answer at `detail`. */
export function dataAnswerAt(
  detail: DetailLevel,
): (read: DataRead) => string | SqlQueryResponse {
  return listAnswerAt(DATA_ANSWERS, detail);
}
