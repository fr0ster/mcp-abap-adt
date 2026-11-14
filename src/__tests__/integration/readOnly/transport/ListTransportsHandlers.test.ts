/**
 * Integration tests for ListTransports Handler
 *
 * Tests the ListTransports handler via AdtClient.getRequest().list():
 * - List modifiable transports for current user
 * - List all transports for current user
 *
 * Run: npm test -- --testPathPattern=integration/readOnly/transport/ListTransports
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { handleListTransports } from '../../../../handlers/transport/readonly/handleListTransports';

import { createTestLogger } from '../../helpers/loggerHelpers';
import { skipRunningTest } from '../../helpers/runningTest';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';
import { transportSearchMissing } from '../../helpers/transportSearch';

function extractResultData(result: any): any {
  const textContent = result.content.find((c: any) => c.type === 'text') as any;
  if (textContent?.text) {
    return JSON.parse(textContent.text);
  }
  throw new Error('No response payload found');
}

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
      const missing = await transportSearchMissing(connection);
      if (missing !== undefined) {
        skipRunningTest(missing);
        return;
      }

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
      assert.equal(data.success, true);
      assert.ok(data.count >= 0);
      assert.equal(Array.isArray(data.transports), true);

      if (data.count > 0) {
        const first = data.transports[0];
        assert.ok(first.number);
      }

      logger?.info(`Found ${data.count} modifiable transport(s)`);
    });
  });

  it('should list all transports (modifiable + released)', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection } = context;
      const missing = await transportSearchMissing(connection);
      if (missing !== undefined) {
        skipRunningTest(missing);
        return;
      }

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
      assert.equal(data.success, true);
      assert.ok(data.count >= 0);
      assert.equal(Array.isArray(data.transports), true);

      logger?.info(`Found ${data.count} total transport(s)`);
    });
  });
});
