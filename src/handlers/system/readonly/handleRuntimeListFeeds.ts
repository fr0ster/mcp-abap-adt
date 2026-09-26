import { AdtRuntimeClient, FeedRepository } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { feedVariantsOf } from '../../../lib/strategies/feedVariants';
import { ourFeeds } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeListFeeds',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[runtime] List available ADT runtime feeds or read a specific feed type. Feed types: dumps, system_messages, gateway_errors. Without feed_type returns available feed descriptors.',
  inputSchema: {
    type: 'object',
    properties: {
      feed_type: {
        type: 'string',
        enum: [
          'descriptors',
          'variants',
          'dumps',
          'system_messages',
          'gateway_errors',
        ],
        description:
          'Feed to read. "descriptors" lists available feeds, "variants" lists feed variants, others read that specific feed. Default: descriptors.',
        default: 'descriptors',
      },
      user: {
        type: 'string',
        description: 'Filter feed entries by SAP username.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of entries to return.',
      },
      from: {
        type: 'string',
        description: 'Start of time range in YYYYMMDDHHMMSS format.',
      },
      to: {
        type: 'string',
        description: 'End of time range in YYYYMMDDHHMMSS format.',
      },
    },
    required: [],
  },
} as const;

interface RuntimeListFeedsArgs {
  feed_type?:
    | 'descriptors'
    | 'variants'
    | 'dumps'
    | 'system_messages'
    | 'gateway_errors';
  user?: string;
  max_results?: number;
  from?: string;
  to?: string;
}

export async function handleRuntimeListFeeds(
  context: HandlerContext,
  args: RuntimeListFeedsArgs,
) {
  const { connection, logger } = context;
  const feeds = new AdtRuntimeClient(connection, logger).getFeeds(ourFeeds);
  const feedType = args?.feed_type ?? 'descriptors';

  const queryOptions = {
    user: args?.user,
    maxResults: args?.max_results,
    from: args?.from,
    to: args?.to,
  };

  // Five separate `answer()` calls, not one `call()` with a branch per
  // `feed_type`: `feeds.list()`/`variants()`/`dumps()`/`systemMessages()`/
  // `gatewayErrors()` each answer a different `T`
  // (`IFeedDescriptor[]`/`IFeedVariant[]`/`IFeedEntry[]`/
  // `ISystemMessageEntry[]`/`IGatewayErrorEntry[]`), none of them exported by
  // name from `@mcp-abap-adt/adt-clients` to write a union with — same
  // reason as the profiler handlers (see `handleRuntimeGetProfilerTraceData.
  // ts`'s header). The projection is identical across all five, so it is
  // shared; only the call differs.
  const ctx = { tool: 'RuntimeListFeeds', detail: 'terse' as const };
  const project = (entries: { length: number }) => ({
    success: true,
    feed_type: feedType,
    count: entries.length,
    entries,
  });

  switch (feedType) {
    case 'descriptors':
      return answer(
        ctx,
        () => feeds.list({ analyse: analyseException }),
        project,
      );
    case 'variants':
      // On premise each feed's query variants come inside the feed list —
      // `feed:queryVariants` in every `atom:entry` of `GET /sap/bc/adt/feeds`
      // — while `GET /sap/bc/adt/feeds/variants?category=…` answered 200 with
      // an empty body for every feed id E19 lists (2026-09-26). So the
      // variants are a reading of the answer `list()` already fetches: the
      // same request, with this repository's reading in the `feeds` slot
      // (feedVariantsOf) in place of the library's, which keeps the feeds and
      // drops their variants. No category is needed, and none is invented.
      return answer(
        ctx,
        () =>
          new FeedRepository(
            connection,
            logger as never,
            {
              ...ourFeeds,
              feeds: feedVariantsOf,
            } as never,
          ).list({ analyse: analyseException }) as never,
        project,
      );
    case 'dumps':
      return answer(
        ctx,
        () => feeds.dumps({ ...queryOptions, analyse: analyseException }),
        project,
      );
    case 'system_messages':
      return answer(
        ctx,
        () =>
          feeds.systemMessages({ ...queryOptions, analyse: analyseException }),
        project,
      );
    case 'gateway_errors':
      return answer(
        ctx,
        () =>
          feeds.gatewayErrors({ ...queryOptions, analyse: analyseException }),
        project,
      );
    default: {
      const exhaustive: never = feedType;
      return return_error(
        new Error(`Unknown feed_type: ${String(exhaustive)}`),
      );
    }
  }
}
