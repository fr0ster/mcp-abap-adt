import type { ILogger } from '@mcp-abap-adt/interfaces';
import { XMLParser } from 'fast-xml-parser';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import type { AnswerDetail } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetSqlQuery',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Execute ABAP SQL SELECT queries on database tables and CDS views via SAP ADT Data Preview API. Use for ad-hoc data retrieval, row counts, and filtered queries. ' +
    'IMPORTANT: SAP appends "INTO TABLE @DATA(LT_RESULT) UP TO <row_number> ROWS ." to your query, so do NOT write your own INTO or UP TO ... ROWS clause — they collide and SAP rejects the statement with a grammar error. ' +
    'Use ABAP SQL syntax (alias~column, spaces inside function parentheses, e.g. SUBSTRING( col, 1, 4 )). ' +
    'The response echoes back the statement SAP actually ran as "executed_query".',
  inputSchema: {
    type: 'object',
    properties: {
      sql_query: {
        type: 'string',
        description:
          'SQL query to execute. Omit INTO and UP TO ... ROWS — SAP adds them. Use row_number to limit rows.',
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

/**
 * `project(detail, terse)` from `projections.ts` hands `terse` only
 * `reading.value` (the generic `structured` parse of `query`/`contents` — see
 * `resultSets.ts`'s `READING_BY_SLOT`; both slots default to `rawDocument`
 * unparsed in `@mcp-abap-adt/adt-clients` itself, so there is no shipped
 * reading to read real `dataPreview:*` tag names off of, and no fixture under
 * `tests/fixtures/adt/` captures one either). `parseSqlQueryXml` below parses
 * the raw payload with its own `XMLParser` configuration, tuned for the data
 * preview shape: `columns` and `data` forced to arrays, tag values kept as
 * strings, and a self-closing `<data/>` kept as an empty cell. The generic
 * parse tree's `REPEATABLE` list was never tuned for that nesting
 * (`dataPreview:columns` and `dataPreview:data` are not in it), and there is no
 * corpus to tune it against. So this projects `reading.raw` rather than
 * `reading.value`.
 */
export function projectRaw(
  detail: AnswerDetail,
  reading: AdtReading<unknown>,
  terseRaw: (raw: string, status: number) => unknown,
): unknown {
  if (detail === 'raw') return reading.raw;
  if (detail === 'full') return reading.value ?? reading.raw;
  return terseRaw(reading.raw, reading.status);
}

/**
 * Interface for SQL query execution response
 */
export interface SqlQueryResponse {
  sql_query: string;
  row_number: number;
  execution_time?: number;
  total_rows?: number;
  /** The statement SAP actually executed (it rewrites the query and appends INTO/UP TO). */
  executed_query?: string;
  columns: Array<{
    name: string;
    /** Key under which this column's value appears in `rows`. Differs from `name` only when the result set has duplicate column names (common in JOINs). */
    key: string;
    type: string;
    description?: string;
    length?: number;
  }>;
  rows: Array<Record<string, any>>;
  /** Non-fatal parse anomalies (e.g. columns of differing length). Absent when clean. */
  warnings?: string[];
}

/**
 * Parser for the ADT data preview payload.
 *
 * `removeNSPrefix` strips the `dataPreview:` prefix from both elements and
 * attributes, so this survives a namespace-prefix change on the SAP side.
 *
 * The remaining options all defend value fidelity, and each one is load-bearing:
 * - `parseTagValue: false` keeps `"0001"` (a NUMC key) from decaying to the
 *   number 1, and keeps a long numeric key from losing precision.
 * - `trimValues: false` preserves leading/trailing blanks, which are meaningful
 *   in fixed-width CHAR columns.
 * - `isArray` forces `columns` and `data` to stay arrays even at length 1,
 *   which keeps single-row and single-column results on the same code path as
 *   everything else.
 */
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  isArray: (name: string) => name === 'columns' || name === 'data',
});

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Parse SAP ADT XML response from freestyle SQL query and convert to JSON format
 *
 * The payload is column-oriented — one `<columns>` block per column, each
 * holding a `<metadata>` descriptor and a `<dataSet>` of `<data>` elements —
 * and this function transposes it into rows.
 *
 * Two properties of the SAP payload make the transposition easy to get wrong,
 * and both used to be:
 *
 * 1. An empty value is emitted as a SELF-CLOSING `<data/>`, not as
 *    `<data></data>`. A parser that only recognises the open/close form drops
 *    those elements, the column's array comes back short, and every value
 *    below the first empty one shifts UP a row — silently attributing data to
 *    the wrong record. (Reproduced against a 7.5x system: `SELECT FIELDNAME,
 *    CHECKTABLE FROM DD03L WHERE TABNAME = 'E070'` has eight empty CHECKTABLE
 *    cells, and the single real value, which belongs to STRKORR, was reported
 *    against AS4USER.) Keeping the empty elements is what holds the rows in register.
 *
 * 2. Column names are NOT unique. A JOIN over E070/E071/E07T yields several
 *    MANDT and TRKORR columns, so keying rows by name alone makes later
 *    columns overwrite earlier ones. Duplicates therefore get a `_2`, `_3`
 *    suffix, reported back to the caller as `columns[].key`.
 *
 * @param xmlData - Raw XML response from ADT
 * @param sqlQuery - Original SQL query
 * @param rowNumber - Number of rows requested
 * @returns Parsed SQL query response
 */
export function parseSqlQueryXml(
  xmlData: string,
  sqlQuery: string,
  rowNumber: number,
  logger?: ILogger,
): SqlQueryResponse {
  try {
    const parsed = xmlParser.parse(xmlData);
    const root = parsed?.tableData ?? parsed?.['dataPreview:tableData'];

    if (!root) {
      throw new Error('No <tableData> element in data preview response');
    }

    const totalRows = Number.parseInt(String(root.totalRows ?? '0'), 10) || 0;
    const executionTime =
      Number.parseFloat(String(root.queryExecutionTime ?? '0')) || 0;
    const executedQuery =
      typeof root.executedQueryString === 'string'
        ? root.executedQueryString.trim()
        : undefined;

    const warnings: string[] = [];
    const columns: SqlQueryResponse['columns'] = [];
    const columnValues: string[][] = [];
    const usedKeys = new Set<string>();

    for (const block of toArray<any>(root.columns)) {
      const meta = block?.metadata ?? {};
      const name = String(meta['@_name'] ?? `COLUMN_${columns.length + 1}`);

      // Disambiguate duplicate column names (JOINs routinely produce them)
      // rather than letting the later column silently overwrite the earlier.
      let key = name;
      let suffix = 2;
      while (usedKeys.has(key)) {
        key = `${name}_${suffix++}`;
      }
      usedKeys.add(key);
      if (key !== name) {
        warnings.push(
          `Duplicate column name "${name}" in result set; exposed as "${key}".`,
        );
      }

      const lengthAttr = meta['@_length'];
      columns.push({
        name,
        key,
        type: String(meta['@_type'] ?? 'UNKNOWN'),
        description: meta['@_description']
          ? String(meta['@_description'])
          : undefined,
        length:
          lengthAttr !== undefined
            ? Number.parseInt(String(lengthAttr), 10)
            : undefined,
      });

      // Self-closing <data/> parses to '' here — kept, not dropped, so the
      // index of every following value still equals its row number.
      columnValues.push(
        toArray<any>(block?.dataSet?.data).map((value) =>
          value === undefined || value === null ? '' : String(value),
        ),
      );
    }

    const lengths = columnValues.map((values) => values.length);
    const maxRowCount = lengths.length > 0 ? Math.max(...lengths) : 0;

    // Every column must carry the same number of cells. If they don't, the
    // rows are no longer trustworthy and the caller needs to be told rather
    // than handed a plausible-looking table.
    if (lengths.length > 0 && new Set(lengths).size > 1) {
      warnings.push(
        `Columns returned differing row counts (${columns
          .map((column, index) => `${column.key}=${lengths[index]}`)
          .join(', ')}); rows may be misaligned.`,
      );
    }

    const rows: Array<Record<string, any>> = [];
    for (let rowIndex = 0; rowIndex < maxRowCount; rowIndex++) {
      const row: Record<string, any> = {};
      columns.forEach((column, columnIndex) => {
        const values = columnValues[columnIndex];
        // `??` not `||`: an empty string and "0" are real values, not nulls.
        // Only a genuinely absent cell becomes null.
        row[column.key] = values[rowIndex] ?? null;
      });
      rows.push(row);
    }

    return {
      sql_query: sqlQuery,
      row_number: rowNumber,
      execution_time: executionTime,
      total_rows: totalRows,
      executed_query: executedQuery,
      columns,
      rows,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (parseError) {
    logger?.error('Failed to parse SQL query XML:', parseError as any);

    // Return basic structure on parse error
    return {
      sql_query: sqlQuery,
      row_number: rowNumber,
      columns: [],
      rows: [],
      error: `Failed to parse XML response: ${
        parseError instanceof Error ? parseError.message : String(parseError)
      }`,
    } as any;
  }
}

/**
 * Handler to execute freestyle SQL queries via SAP ADT Data Preview API
 *
 * @param args - Tool arguments containing sql_query and optional row_number parameter
 * @returns Response with parsed SQL query results or error
 */
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
    (reading: AdtReading<unknown>) =>
      projectRaw(detail, reading, (raw) => {
        const parsedData = parseSqlQueryXml(raw, sqlQuery, rowNumber, logger);
        logger?.debug(
          `Parsed SQL query data: rows=${parsedData.rows.length}/${parsedData.total_rows ?? 0}, columns=${parsedData.columns.length}`,
        );
        return parsedData;
      }),
  );
}
