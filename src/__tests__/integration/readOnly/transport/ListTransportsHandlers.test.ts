/**
 * Integration tests for ListTransports Handler
 *
 * Tests the ListTransports handler via AdtClient.getRequest().list(), the
 * query by user (no saved search configuration, on premise and cloud alike):
 * - List modifiable transports for current user
 * - List all transports for current user
 *
 * Run: npm run test:integration -- src/__tests__/integration/readOnly/transport/ListTransportsHandlers.test.ts
 */

import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { handleListTransports } from '../../../../handlers/transport/readonly/handleListTransports';

import { createTestLogger } from '../../helpers/loggerHelpers';
import { servedSuite } from '../../helpers/servedHere';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

/**
 * ListTransports' terse answer (the default) read back: `# count N`, then
 * one TSV row per request, its number first.
 */
function extractResultData(result: any): {
  count: number;
  numbers: string[];
} {
  const textContent = result.content.find((c: any) => c.type === 'text') as any;
  const lines = String(textContent?.text ?? '').split('\n');
  const count = Number(
    lines.find((line) => line.startsWith('# count '))?.slice(8) ?? NaN,
  );
  const rows = lines.filter((line) => line !== '' && !line.startsWith('#'));
  assert.equal(rows[0]?.split('\t')[0], 'number', lines.join('\n'));
  return {
    count,
    numbers: rows.slice(1).map((row) => row.split('\t')[0] ?? ''),
  };
}

/**
 * This file's `describe`: the suite runs where the configured system serves
 * every tool it calls, and skips naming the first it does not serve.
 */
const describe = servedSuite(['ListTransports']);

describe('ListTransports Handler Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('list-transports-test');

  before(async () => {
    tester = new LambdaTester(
      'list_transports_readonly',
      'test_list_transports',
      'list-transports-test',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        logger?.info('ListTransports test setup complete');
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

  it('should list modifiable transports for current user', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection } = context;
      const result = await tester.invokeToolOrHandler(
        'ListTransports',
        { modifiable_only: true },
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleListTransports(handlerContext, {
            modifiable_only: true,
          });
        },
      );

      assert.equal(
        result.isError,
        false,
        `ListTransports answered an error: ${JSON.stringify(result.content)}`,
      );
      assert.ok(result.content !== undefined);

      const data = extractResultData(result);
      assert.ok(data.count >= 0);
      assert.equal(data.numbers.length, data.count);

      if (data.count > 0) {
        assert.ok(data.numbers[0]);
      }

      logger?.info(`Found ${data.count} modifiable transport(s)`);
    });
  });

  it('should list all transports (modifiable + released)', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection } = context;
      const result = await tester.invokeToolOrHandler(
        'ListTransports',
        { modifiable_only: false },
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleListTransports(handlerContext, {
            modifiable_only: false,
          });
        },
      );

      assert.equal(
        result.isError,
        false,
        `ListTransports answered an error: ${JSON.stringify(result.content)}`,
      );

      const data = extractResultData(result);
      assert.ok(data.count >= 0);
      assert.equal(data.numbers.length, data.count);

      logger?.info(`Found ${data.count} total transport(s)`);
    });
  });
});
