import type { ILogger } from '@mcp-abap-adt/interfaces';
import { XMLParser } from 'fast-xml-parser';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
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
    },
    required: ['sql_query'],
  },
} as const;

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
 * Pull the human-readable reason out of an ADT `<exc:exception>` body.
 *
 * The Data Preview endpoint answers a rejected statement with a precise
 * diagnosis — `"UP" is invalid here (due to grammar).` — and losing it leaves
 * the caller staring at a bare HTTP status with no way to tell a typo from an
 * unsupported construct.
 */
function extractSapErrorMessage(error: any): string | undefined {
  const data = error?.response?.data;
  if (!data) return undefined;

  const raw = typeof data === 'string' ? data : String(data);
  if (!raw.includes('exception')) return undefined;

  try {
    const parsed = xmlParser.parse(raw);
    const exception = parsed?.exception ?? parsed?.['exc:exception'];
    const message = exception?.message ?? exception?.localizedMessage;
    const text =
      typeof message === 'object' ? message?.['#text'] : (message as string);
    return typeof text === 'string' && text.trim() ? text.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * SAP rewrites the submitted statement, appending its own INTO and UP TO
 * clauses. A caller-supplied clause of either kind therefore arrives as a
 * duplicate, and SAP reports it as a grammar error that says nothing about the
 * real cause. Recognise that shape and explain it.
 */
function hintForSapError(
  message: string,
  sqlQuery: string,
): string | undefined {
  if (!/invalid here|due to grammar/i.test(message)) return undefined;

  if (/\bINTO\b/i.test(sqlQuery)) {
    return 'Your query contains an INTO clause. SAP appends "INTO TABLE @DATA(LT_RESULT)" itself — remove yours.';
  }
  if (/\bUP\s+TO\b/i.test(sqlQuery)) {
    return 'Your query contains an UP TO ... ROWS clause. SAP appends "UP TO <row_number> ROWS" itself — remove yours and use the row_number parameter.';
  }
  return 'SAP appends "INTO TABLE @DATA(LT_RESULT) UP TO <row_number> ROWS ." to the statement. Note that ABAP SQL requires alias~column and spaces inside function parentheses, e.g. SUBSTRING( col, 1, 4 ).';
}

/**
 * Handler to execute freestyle SQL queries via SAP ADT Data Preview API
 *
 * @param args - Tool arguments containing sql_query and optional row_number parameter
 * @returns Response with parsed SQL query results or error
 */
export async function handleGetSqlQuery(context: HandlerContext, args: any) {
  const { connection, logger } = context;
  try {
    logger?.info('handleGetSqlQuery called');

    if (!args?.sql_query) {
      return return_error('SQL query is required');
    }

    const sqlQuery = args.sql_query;
    const rowNumber = args.row_number || 100; // Default to 100 rows if not specified

    logger?.info(`Executing SQL query (rows=${rowNumber})`);

    const client = createAdtClient(connection, logger);

    let response: any;
    try {
      response = await client
        .getUtils()
        .getSqlQuery({ sql_query: sqlQuery, row_number: rowNumber });
    } catch (requestError: any) {
      // SAP's own diagnosis is far more useful than the transport-level
      // failure wrapping it, so surface that instead of discarding the body.
      const sapMessage = extractSapErrorMessage(requestError);
      if (!sapMessage) throw requestError;

      const hint = hintForSapError(sapMessage, sqlQuery);
      logger?.error(`SQL query rejected by SAP: ${sapMessage}`);
      return return_error(hint ? `${sapMessage} ${hint}` : sapMessage);
    }

    if (response.status === 200 && response.data) {
      logger?.info('SQL query request completed successfully');

      // Parse the XML response
      const parsedData = parseSqlQueryXml(
        response.data,
        sqlQuery,
        rowNumber,
        logger,
      );

      logger?.debug(
        `Parsed SQL query data: rows=${parsedData.rows.length}/${parsedData.total_rows ?? 0}, columns=${parsedData.columns.length}`,
      );

      const result = {
        isError: false,
        content: [
          {
            type: 'text',
            text: JSON.stringify(parsedData, null, 2),
          },
        ],
      };
      return result;
    } else {
      return return_error(
        `Failed to execute SQL query. Status: ${response.status}`,
      );
    }
  } catch (error) {
    logger?.error('Failed to execute SQL query', error as any);
    return return_error(error);
  }
}
