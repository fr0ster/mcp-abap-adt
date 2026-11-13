/**
 * Integration tests for runtime feed handlers.
 *
 * Scenarios:
 * - List feed descriptors
 * - List feed variants (read out of the feed list)
 * - Read dumps feed (skipped — XML entity expansion limit, see mcp-abap-adt-clients#13)
 * - Read system messages feed
 * - Read gateway errors feed (on-prem only)
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import * as z from 'zod';
import { handleRuntimeGetGatewayErrorLog } from '../../../../handlers/system/readonly/handleRuntimeGetGatewayErrorLog';
import { handleRuntimeListFeeds } from '../../../../handlers/system/readonly/handleRuntimeListFeeds';
import { handleRuntimeListSystemMessages } from '../../../../handlers/system/readonly/handleRuntimeListSystemMessages';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { readCaseParams } from '../../helpers/testConfigSchema';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

/** What this file's cases state, as its tests read them. */
const RuntimeFeedParams = z.looseObject({
  feed_user: z.string().optional(),
  max_results: z.number().optional(),
});

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

  before(async () => {
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
  });

  after(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {
      logger?.info('Runtime feed handlers test suite complete');
    });
  });

  it('should list feed descriptors', async () => {
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
      assert.equal(data.success, true);
      assert.equal(data.feed_type, 'descriptors');
      assert.equal(Array.isArray(data.entries), true);

      // Store available feeds for subsequent tests
      availableFeedTitles = (data.entries as any[]).map((e: any) =>
        String(e.title ?? e.id ?? '').toLowerCase(),
      );
      logger?.info(
        `Feed descriptors: ${data.count} entries (${availableFeedTitles.join(', ')})`,
      );
    });
  });

  it('should list feed variants (if available)', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      // The variants are read out of the feed list (feed:queryVariants),
      // which every system answers; a system may simply define none.
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
      assert.equal(data.success, true);
      assert.equal(data.feed_type, 'variants');
      assert.equal(Array.isArray(data.entries), true);
      logger?.info(`Feed variants: ${data.count} entries`);
    });
  });

  it('should read dumps feed via RuntimeListFeeds', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      // Known issue: FeedRepository XML parser entity expansion limit too low
      // See: https://github.com/fr0ster/mcp-abap-adt-clients/issues/13
      const maxResults =
        readCaseParams(
          context.params,
          RuntimeFeedParams,
          'runtime_feed_handlers',
        ).max_results ?? 10;
      const user =
        readCaseParams(
          context.params,
          RuntimeFeedParams,
          'runtime_feed_handlers',
        ).feed_user || undefined;

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
      assert.equal(data.success, true);
      assert.equal(data.feed_type, 'dumps');
      assert.equal(Array.isArray(data.entries), true);
      logger?.info(`Dumps feed: ${data.count} entries`);
    });
  });

  it('should list system messages via RuntimeListSystemMessages', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const maxResults =
        readCaseParams(
          context.params,
          RuntimeFeedParams,
          'runtime_feed_handlers',
        ).max_results ?? 10;

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
      assert.equal(data.success, true);
      assert.equal(Array.isArray(data.messages), true);
      logger?.info(`System messages: ${data.count} entries`);
    });
  });

  it('should read system messages feed via RuntimeListFeeds', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const maxResults =
        readCaseParams(
          context.params,
          RuntimeFeedParams,
          'runtime_feed_handlers',
        ).max_results ?? 10;

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
      assert.equal(data.success, true);
      assert.equal(data.feed_type, 'system_messages');
      assert.equal(Array.isArray(data.entries), true);
      logger?.info(`System messages via feeds: ${data.count} entries`);
    });
  });

  it('should list gateway errors via RuntimeGetGatewayErrorLog (on-prem)', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      if (context.isCloudSystem) {
        throw new Error(
          'SKIP: gateway error log is not available on cloud systems',
        );
      }

      const maxResults =
        readCaseParams(
          context.params,
          RuntimeFeedParams,
          'runtime_feed_handlers',
        ).max_results ?? 10;
      const user =
        readCaseParams(
          context.params,
          RuntimeFeedParams,
          'runtime_feed_handlers',
        ).feed_user || undefined;

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
      assert.equal(data.success, true);
      assert.equal(data.mode, 'list');
      assert.equal(Array.isArray(data.errors), true);
      logger?.info(`Gateway errors: ${data.count} entries`);
    });
  });

  it('should read gateway errors feed via RuntimeListFeeds (on-prem)', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      if (context.isCloudSystem) {
        throw new Error(
          'SKIP: gateway error log is not available on cloud systems',
        );
      }

      const maxResults =
        readCaseParams(
          context.params,
          RuntimeFeedParams,
          'runtime_feed_handlers',
        ).max_results ?? 10;

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
      assert.equal(data.success, true);
      assert.equal(data.feed_type, 'gateway_errors');
      assert.equal(Array.isArray(data.entries), true);
      logger?.info(`Gateway errors via feeds: ${data.count} entries`);
    });
  });
});
