/**
 * Integration tests for ListTransports Handler
 *
 * Tests the ListTransports handler via AdtClient.getRequest().list():
 * - List modifiable transports for current user
 * - List all transports for current user
 *
 * Run: npm test -- --testPathPattern=integration/readOnly/transport/ListTransports
 */

import { handleListTransports } from '../../../../handlers/transport/readonly/handleListTransports';
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

describe('ListTransports Handler Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('list-transports-test');

  beforeAll(async () => {
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
  }, getTimeout('long'));

  afterAll(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {
      logger?.info('Test suite cleanup complete');
    });
  });

  it(
    'should list modifiable transports for current user',
    async () => {
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

        expect(result.isError).toBe(false);
        expect(result.content).toBeDefined();

        const data = extractResultData(result);
        expect(data.success).toBe(true);
        expect(data.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(data.transports)).toBe(true);

        if (data.count > 0) {
          const first = data.transports[0];
          expect(first.number).toBeTruthy();
        }

        logger?.info(`Found ${data.count} modifiable transport(s)`);
      });
    },
    getTimeout('long'),
  );

  it(
    'should list all transports (modifiable + released)',
    async () => {
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

        expect(result.isError).toBe(false);

        const data = extractResultData(result);
        expect(data.success).toBe(true);
        expect(data.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(data.transports)).toBe(true);

        logger?.info(`Found ${data.count} total transport(s)`);
      });
    },
    getTimeout('long'),
  );
});
