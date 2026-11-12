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
 * Run: npm test -- --testPathPattern=integration/readOnly/system/SqlQuery
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { handleGetSqlQuery } from '../../../../handlers/system/readonly/handleGetSqlQuery';

import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

function extractResultData(result: any): any {
  const textContent = result.content.find((c: any) => c.type === 'text') as any;
  if (textContent?.text) {
    return JSON.parse(textContent.text);
  }
  throw new Error('No response payload found');
}

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
      const { connection, params } = context;
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

      assert.equal(result.isError, false);
      assert.ok(result.content !== undefined);
      assert.ok(result.content.length > 0);

      const data = extractResultData(result);
      assert.equal(data.sql_query, sqlQuery);
      assert.ok(data.columns !== undefined);
      assert.equal(Array.isArray(data.columns), true);
      assert.ok(data.columns.length > 0);
      assert.ok(data.rows !== undefined);
      assert.equal(Array.isArray(data.rows), true);

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
