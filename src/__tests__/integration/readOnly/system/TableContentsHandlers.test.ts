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
 * Run: npm run test:integration -- src/__tests__/integration/readOnly/system/TableContentsHandlers.test.ts
 */

import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import {
  TOOL_DEFINITION as GetTableContents,
  handleGetTableContents,
} from '../../../../handlers/table/readonly/handleGetTableContents';

import { schemaWords } from '../../../helpers/schemaWords';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { servedSuite } from '../../helpers/servedHere';
import { terseOf, terseText } from '../../helpers/terseAnswer';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

/**
 * This file's `describe`: the suite runs where the configured system serves
 * every tool it calls, and skips naming the first it does not serve.
 */
const describe = servedSuite(['GetTableContents']);

describe('GetTableContents Handler Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('table-contents-test');

  before(async () => {
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
  });

  after(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {
      logger?.info('Test suite cleanup complete');
    });
  });

  it('should retrieve table contents', async () => {
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
          return handleGetTableContents(
            handlerContext,
            GetTableContents.inputSchema.parse({
              table_name: tableName,
              max_rows: maxRows,
            }),
          );
        },
      );

      if (result.isError) {
        logger?.error(`Error: ${result.content?.[0]?.text}`);
      }
      assert.equal(result.isError, false, JSON.stringify(result.content));
      assert.ok(result.content !== undefined);
      assert.ok(result.content.length > 0);

      // The terse answer: the total, the column names, a row per record.
      const data = terseOf(terseText(result));
      assert.ok(data.columns.length > 0, data.text);
      assert.ok(data.rows.length > 0, data.text);
      assert.ok(data.rows.length <= Number(maxRows), data.text);

      logger?.info(
        `Table ${tableName}: ${data.rows.length} rows, ${data.columns.length} columns`,
      );
    });
  });

  it('refuses a blank table_name in its schema, before any request', () => {
    // The rule lives in the tool's schema (24.0.0): the listed schema
    // refuses the call before dispatch, so the handler is not reached.
    assert.ok(
      schemaWords(GetTableContents, { table_name: '' }).includes(
        'Table name is required',
      ),
    );
  });
});
