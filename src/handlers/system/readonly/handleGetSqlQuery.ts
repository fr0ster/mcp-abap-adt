import type { ILogger } from '@mcp-abap-adt/interfaces';
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

/**
 * `project(detail, terse)` from `projections.ts` hands `terse` only
 * `reading.value` (the generic `structured` parse of `query`/`contents` — see
 * `resultSets.ts`'s `READING_BY_SLOT`; both slots default to `rawDocument`
 * unparsed in `@mcp-abap-adt/adt-clients` itself, so there is no shipped
 * reading to read real `dataPreview:*` tag names off of, and no fixture under
 * `tests/fixtures/adt/` captures one either). `parseSqlQueryXml` below is the
 * pre-migration regex parser, proven against real ADT responses; redesigning
 * it against the generic parse tree with no corpus and no shipped reference
 * would be guessing at column/row nesting that the fast-xml-parser
 * `REPEATABLE` list was never tuned for (`dataPreview:columns` and
 * `dataPreview:data` are not in it). So this projects `reading.raw` — the
 * identical bytes the regex always ran against — rather than `reading.value`.
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
  columns: Array<{
    name: string;
    type: string;
    description?: string;
    length?: number;
  }>;
  rows: Array<Record<string, any>>;
}

/**
 * Parse SAP ADT XML response from freestyle SQL query and convert to JSON format
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
    // Extract basic information
    const totalRowsMatch = xmlData.match(
      /<dataPreview:totalRows>(\d+)<\/dataPreview:totalRows>/,
    );
    const totalRows = totalRowsMatch ? parseInt(totalRowsMatch[1], 10) : 0;

    const queryTimeMatch = xmlData.match(
      /<dataPreview:queryExecutionTime>([\d.]+)<\/dataPreview:queryExecutionTime>/,
    );
    const queryExecutionTime = queryTimeMatch
      ? parseFloat(queryTimeMatch[1])
      : 0;

    // Extract column metadata
    const columns: Array<{
      name: string;
      type: string;
      description?: string;
      length?: number;
    }> = [];
    const columnMatches = xmlData.match(/<dataPreview:metadata[^>]*>/g);

    if (columnMatches) {
      columnMatches.forEach((match) => {
        const nameMatch = match.match(/dataPreview:name="([^"]+)"/);
        const typeMatch = match.match(/dataPreview:type="([^"]+)"/);
        const descMatch = match.match(/dataPreview:description="([^"]+)"/);
        const lengthMatch = match.match(/dataPreview:length="(\d+)"/);

        if (nameMatch) {
          columns.push({
            name: nameMatch[1],
            type: typeMatch ? typeMatch[1] : 'UNKNOWN',
            description: descMatch ? descMatch[1] : '',
            length: lengthMatch ? parseInt(lengthMatch[1], 10) : undefined,
          });
        }
      });
    }

    // Extract row data
    const rows: Array<Record<string, any>> = [];

    // Find all column sections
    const columnSections = xmlData.match(
      /<dataPreview:columns>.*?<\/dataPreview:columns>/gs,
    );

    if (columnSections && columnSections.length > 0) {
      // Extract data for each column
      const columnData: Record<string, (string | null)[]> = {};

      columnSections.forEach((section, index) => {
        if (index < columns.length) {
          const columnName = columns[index].name;
          const dataMatches = section.match(
            /<dataPreview:data[^>]*>(.*?)<\/dataPreview:data>/g,
          );

          if (dataMatches) {
            columnData[columnName] = dataMatches.map((match) => {
              const content = match.replace(/<[^>]+>/g, '');
              return content || null;
            });
          } else {
            columnData[columnName] = [];
          }
        }
      });

      // Convert column-based data to row-based data
      const maxRowCount = Math.max(
        ...Object.values(columnData).map((arr) => arr.length),
        0,
      );

      for (let rowIndex = 0; rowIndex < maxRowCount; rowIndex++) {
        const row: Record<string, any> = {};
        columns.forEach((column) => {
          const columnValues = columnData[column.name] || [];
          row[column.name] = columnValues[rowIndex] || null;
        });
        rows.push(row);
      }
    }

    return {
      sql_query: sqlQuery,
      row_number: rowNumber,
      execution_time: queryExecutionTime,
      total_rows: totalRows,
      columns,
      rows,
    };
  } catch (parseError) {
    logger?.error('Failed to parse SQL query XML:', parseError as any);

    // Return basic structure on parse error
    return {
      sql_query: sqlQuery,
      row_number: rowNumber,
      columns: [],
      rows: [],
      error: 'Failed to parse XML response',
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
