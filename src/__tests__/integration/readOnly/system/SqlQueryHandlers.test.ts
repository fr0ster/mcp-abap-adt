/**
 * Integration tests for GetSqlQuery Handler
 *
 * Tests freestyle SQL query execution via SAP ADT Data Preview API.
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm run test:integration -- src/__tests__/integration/readOnly/system/SqlQueryHandlers.test.ts
 */

import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import * as z from 'zod';
import { handleGetSqlQuery } from '../../../../handlers/system/readonly/handleGetSqlQuery';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { servedSuite } from '../../helpers/servedHere';
import { headOf, terseOf, terseText } from '../../helpers/terseAnswer';
import { readCaseParams } from '../../helpers/testConfigSchema';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

/** What this file's cases state, as its tests read them. */
const SqlQueryParams = z.looseObject({
  test_row_number: z.number().optional(),
  test_sql_query: z.string().optional(),
});

/**
 * This file's `describe`: the suite runs where the configured system serves
 * every tool it calls, and skips naming the first it does not serve.
 */
const describe = servedSuite(['GetSqlQuery']);

describe('GetSqlQuery Handler Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('sql-query-test');

  before(async () => {
    tester = new LambdaTester(
      'get_sql_query',
      'simple_select',
      'sql-query-test',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        logger?.info('Setup complete');
      },
      async (_context: LambdaTesterContext) => {
        // No cleanup needed for read-only handler
      },
    );
  });

  after(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {
      logger?.info('Test suite cleanup complete');
    });
  });

  it('should execute SQL query and return results', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection } = context;
      const params = readCaseParams(
        context.params,
        SqlQueryParams,
        'get_sql_query',
      );
      const sqlQuery =
        params?.test_sql_query || 'SELECT MANDT, MTEXT FROM T000';
      const rowNumber = params?.test_row_number || 10;

      logger?.info(`Executing SQL query: ${sqlQuery}`);

      const result = await tester.invokeToolOrHandler(
        'GetSqlQuery',
        { sql_query: sqlQuery, row_number: rowNumber },
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleGetSqlQuery(handlerContext, {
            sql_query: sqlQuery,
            row_number: rowNumber,
          });
        },
      );

      assert.equal(result.isError, false, JSON.stringify(result.content));
      assert.ok(result.content !== undefined);
      assert.ok(result.content.length > 0);

      // The terse answer: the total, the column names, a row per record.
      const data = terseOf(terseText(result));
      assert.ok(data.columns.length > 0, data.text);
      assert.ok(data.rows.length <= rowNumber, data.text);
      const total = headOf(data, 'total_rows');
      if (total !== undefined) assert.ok(Number(total) >= data.rows.length);

      logger?.info(
        `Query returned ${data.rows.length} rows, ${data.columns.length} columns`,
      );
    });
  });

  it('should handle missing sql_query parameter', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection } = context;

      logger?.info('Testing error handling: missing sql_query');

      const result = await tester.invokeToolOrHandler(
        'GetSqlQuery',
        { sql_query: '' },
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleGetSqlQuery(handlerContext, { sql_query: '' });
        },
      );

      assert.equal(result.isError, true);
      assert.ok(result.content !== undefined);
      assert.ok(result.content.length > 0);

      logger?.info('Error handling validated: missing sql_query');
    });
  });
});
