/**
 * Integration tests for GetTableContents Handler
 *
 * Tests table contents retrieval via SAP ADT Data Preview API.
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/readOnly/system/TableContents
 */

import { handleGetTableContents } from '../../../../handlers/table/readonly/handleGetTableContents';
import { getTimeout } from '../../helpers/configHelpers';
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

describe('GetTableContents Handler Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('table-contents-test');

  beforeAll(async () => {
    tester = new LambdaTester(
      'get_table_contents',
      'limited_rows',
      'table-contents-test',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        logger?.info('Setup complete');
      },
      async (_context: LambdaTesterContext) => {
        // No cleanup needed for read-only handler
      },
    );
  }, getTimeout('long'));

  afterAll(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {
      logger?.info('Test suite cleanup complete');
    });
  });

  it(
    'should retrieve table contents',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const tableName = params?.test_table || 'T000';
        const maxRows = params?.max_rows || 10;

        logger?.info(`Reading table: ${tableName} (max_rows=${maxRows})`);

        const result = await tester.invokeToolOrHandler(
          'GetTableContents',
          { table_name: tableName, max_rows: maxRows },
          async () => {
            const handlerContext = createHandlerContext({ connection, logger });
            return handleGetTableContents(handlerContext, {
              table_name: tableName,
              max_rows: maxRows,
            });
          },
        );

        if (result.isError) {
          logger?.error(`Error: ${result.content?.[0]?.text}`);
        }
        expect(result.isError).toBe(false);
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);

        const data = extractResultData(result);
        expect(data.columns).toBeDefined();
        expect(Array.isArray(data.columns)).toBe(true);
        expect(data.columns.length).toBeGreaterThan(0);
        expect(data.rows).toBeDefined();
        expect(Array.isArray(data.rows)).toBe(true);
        expect(data.rows.length).toBeGreaterThan(0);
        expect(data.rows.length).toBeLessThanOrEqual(maxRows);

        logger?.info(
          `Table ${tableName}: ${data.rows.length} rows, ${data.columns.length} columns`,
        );
      });
    },
    getTimeout('long'),
  );

  it(
    'should handle missing table_name parameter',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection } = context;

        logger?.info('Testing error handling: missing table_name');

        const result = await tester.invokeToolOrHandler(
          'GetTableContents',
          { table_name: '' },
          async () => {
            const handlerContext = createHandlerContext({ connection, logger });
            return handleGetTableContents(handlerContext, { table_name: '' });
          },
        );

        expect(result.isError).toBe(true);
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);

        logger?.info('Error handling validated: missing table_name');
      });
    },
    getTimeout('default'),
  );
});
