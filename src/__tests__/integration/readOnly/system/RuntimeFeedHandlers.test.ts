/**
 * Integration tests for runtime feed handlers.
 *
 * Scenarios:
 * - List feed descriptors
 * - List feed variants (skipped if not available on system)
 * - Read dumps feed (skipped — XML entity expansion limit, see mcp-abap-adt-clients#13)
 * - Read system messages feed
 * - Read gateway errors feed (on-prem only)
 */

import { handleRuntimeGetGatewayErrorLog } from '../../../../handlers/system/readonly/handleRuntimeGetGatewayErrorLog';
import { handleRuntimeListFeeds } from '../../../../handlers/system/readonly/handleRuntimeListFeeds';
import { handleRuntimeListSystemMessages } from '../../../../handlers/system/readonly/handleRuntimeListSystemMessages';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

function parseTextPayload(result: any): any {
  const textContent = result.content.find((c: any) => c.type === 'text') as any;
  if (!textContent?.text) {
    throw new Error('Missing text payload in handler response');
  }
  return JSON.parse(textContent.text);
}

function extractErrorText(result: any): string {
  try {
    const textContent = result?.content?.find((c: any) => c.type === 'text');
    if (typeof textContent?.text === 'string') return textContent.text;
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function expectSuccess(result: any, label: string): void {
  if (result.isError) {
    const errorText = extractErrorText(result);
    throw new Error(`${label} returned error: ${errorText.slice(0, 500)}`);
  }
}

describe('Runtime Feed Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('runtime-feeds');
  /** Feed descriptor titles returned by the system — populated by first test */
  let availableFeedTitles: string[] = [];

  beforeAll(async () => {
    tester = new LambdaTester(
      'runtime_feed_handlers',
      'test_runtime_feeds',
      'runtime-feeds',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        logger?.info('Runtime feed handlers setup complete');
      },
      async (_context: LambdaTesterContext) => {
        logger?.info('No cleanup required for readonly feed handlers');
      },
    );
  }, getTimeout('long'));

  afterAll(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {
      logger?.info('Runtime feed handlers test suite complete');
    });
  });

  it(
    'should list feed descriptors',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const result = await tester.invokeToolOrHandler(
          'RuntimeListFeeds',
          { feed_type: 'descriptors' },
          async () => {
            const handlerContext = createHandlerContext({
              connection: context.connection,
              logger,
            });
            return handleRuntimeListFeeds(handlerContext, {
              feed_type: 'descriptors',
            });
          },
        );

        expectSuccess(result, 'RuntimeListFeeds(descriptors)');
        const data = parseTextPayload(result);
        expect(data.success).toBe(true);
        expect(data.feed_type).toBe('descriptors');
        expect(Array.isArray(data.entries)).toBe(true);

        // Store available feeds for subsequent tests
        availableFeedTitles = (data.entries as any[]).map((e: any) =>
          String(e.title ?? e.id ?? '').toLowerCase(),
        );
        logger?.info(
          `Feed descriptors: ${data.count} entries (${availableFeedTitles.join(', ')})`,
        );
      });
    },
    getTimeout('long'),
  );

  it(
    'should list feed variants (if available)',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        // /sap/bc/adt/feeds/variants may not be available on all systems
        const result = await tester.invokeToolOrHandler(
          'RuntimeListFeeds',
          { feed_type: 'variants' },
          async () => {
            const handlerContext = createHandlerContext({
              connection: context.connection,
              logger,
            });
            return handleRuntimeListFeeds(handlerContext, {
              feed_type: 'variants',
            });
          },
        );

        if (result.isError) {
          const errorText = extractErrorText(result);
          throw new Error(
            `SKIP: feed variants endpoint not supported on this system (${errorText.slice(0, 200)})`,
          );
        }

        const data = parseTextPayload(result);
        expect(data.success).toBe(true);
        expect(data.feed_type).toBe('variants');
        expect(Array.isArray(data.entries)).toBe(true);
        logger?.info(`Feed variants: ${data.count} entries`);
      });
    },
    getTimeout('long'),
  );

  it(
    'should read dumps feed via RuntimeListFeeds',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        // Known issue: FeedRepository XML parser entity expansion limit too low
        // See: https://github.com/fr0ster/mcp-abap-adt-clients/issues/13
        const maxResults = context.params?.max_results ?? 10;
        const user = context.params?.feed_user || undefined;

        const result = await tester.invokeToolOrHandler(
          'RuntimeListFeeds',
          { feed_type: 'dumps', max_results: maxResults, user },
          async () => {
            const handlerContext = createHandlerContext({
              connection: context.connection,
              logger,
            });
            return handleRuntimeListFeeds(handlerContext, {
              feed_type: 'dumps',
              max_results: maxResults,
              user,
            });
          },
        );

        if (result.isError) {
          const errorText = extractErrorText(result);
          if (errorText.includes('Entity expansion limit')) {
            throw new Error(
              'SKIP: XML entity expansion limit in FeedRepository (mcp-abap-adt-clients#13)',
            );
          }
          throw new Error(
            `RuntimeListFeeds(dumps) returned error: ${errorText.slice(0, 500)}`,
          );
        }

        const data = parseTextPayload(result);
        expect(data.success).toBe(true);
        expect(data.feed_type).toBe('dumps');
        expect(Array.isArray(data.entries)).toBe(true);
        logger?.info(`Dumps feed: ${data.count} entries`);
      });
    },
    getTimeout('long'),
  );

  it(
    'should list system messages via RuntimeListSystemMessages',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const maxResults = context.params?.max_results ?? 10;

        const result = await tester.invokeToolOrHandler(
          'RuntimeListSystemMessages',
          { max_results: maxResults },
          async () => {
            const handlerContext = createHandlerContext({
              connection: context.connection,
              logger,
            });
            return handleRuntimeListSystemMessages(handlerContext, {
              max_results: maxResults,
            });
          },
        );

        expectSuccess(result, 'RuntimeListSystemMessages');
        const data = parseTextPayload(result);
        expect(data.success).toBe(true);
        expect(Array.isArray(data.messages)).toBe(true);
        logger?.info(`System messages: ${data.count} entries`);
      });
    },
    getTimeout('long'),
  );

  it(
    'should read system messages feed via RuntimeListFeeds',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const maxResults = context.params?.max_results ?? 10;

        const result = await tester.invokeToolOrHandler(
          'RuntimeListFeeds',
          { feed_type: 'system_messages', max_results: maxResults },
          async () => {
            const handlerContext = createHandlerContext({
              connection: context.connection,
              logger,
            });
            return handleRuntimeListFeeds(handlerContext, {
              feed_type: 'system_messages',
              max_results: maxResults,
            });
          },
        );

        expectSuccess(result, 'RuntimeListFeeds(system_messages)');
        const data = parseTextPayload(result);
        expect(data.success).toBe(true);
        expect(data.feed_type).toBe('system_messages');
        expect(Array.isArray(data.entries)).toBe(true);
        logger?.info(`System messages via feeds: ${data.count} entries`);
      });
    },
    getTimeout('long'),
  );

  it(
    'should list gateway errors via RuntimeGetGatewayErrorLog (on-prem)',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        if (context.isCloudSystem) {
          throw new Error(
            'SKIP: gateway error log is not available on cloud systems',
          );
        }

        const maxResults = context.params?.max_results ?? 10;
        const user = context.params?.feed_user || undefined;

        const result = await tester.invokeToolOrHandler(
          'RuntimeGetGatewayErrorLog',
          { max_results: maxResults, user },
          async () => {
            const handlerContext = createHandlerContext({
              connection: context.connection,
              logger,
            });
            return handleRuntimeGetGatewayErrorLog(handlerContext, {
              max_results: maxResults,
              user,
            });
          },
        );

        expectSuccess(result, 'RuntimeGetGatewayErrorLog');
        const data = parseTextPayload(result);
        expect(data.success).toBe(true);
        expect(data.mode).toBe('list');
        expect(Array.isArray(data.errors)).toBe(true);
        logger?.info(`Gateway errors: ${data.count} entries`);
      });
    },
    getTimeout('long'),
  );

  it(
    'should read gateway errors feed via RuntimeListFeeds (on-prem)',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        if (context.isCloudSystem) {
          throw new Error(
            'SKIP: gateway error log is not available on cloud systems',
          );
        }

        const maxResults = context.params?.max_results ?? 10;

        const result = await tester.invokeToolOrHandler(
          'RuntimeListFeeds',
          { feed_type: 'gateway_errors', max_results: maxResults },
          async () => {
            const handlerContext = createHandlerContext({
              connection: context.connection,
              logger,
            });
            return handleRuntimeListFeeds(handlerContext, {
              feed_type: 'gateway_errors',
              max_results: maxResults,
            });
          },
        );

        expectSuccess(result, 'RuntimeListFeeds(gateway_errors)');
        const data = parseTextPayload(result);
        expect(data.success).toBe(true);
        expect(data.feed_type).toBe('gateway_errors');
        expect(Array.isArray(data.entries)).toBe(true);
        logger?.info(`Gateway errors via feeds: ${data.count} entries`);
      });
    },
    getTimeout('long'),
  );
});
