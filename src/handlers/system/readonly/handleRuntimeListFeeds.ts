import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
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
  const feeds = new AdtRuntimeClient(connection, logger).getFeeds();
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
      return answer(ctx, () => feeds.list(), project);
    case 'variants':
      // `variants(category)` takes a required `category` as of adt-clients
      // 19 — ADT's own endpoint always required one (`GET
      // /sap/bc/adt/feeds/variants` with none answers 400
      // `ExceptionParameterNotFound`, measured; see `FeedRepository.
      // variants`'s own doc: "Everything that called this before
      // @mcp-abap-adt/interfaces@26.0.0 fixed the contract was getting that
      // 400"). The tool surface is frozen for this migration (only an
      // optional `detail` parameter may be added), so there is nowhere to
      // take a real category from.
      //
      // **Fix round 1, task 25.** The first pass here called
      // `feeds.variants('')`, reasoning that an empty category reaches "the
      // same refusal" a categoryless call always did. That is a guess, not
      // a measurement: the pre-19 wire sent no `category` query parameter
      // at all, and the 19.0.0 wire always appends one — `category=` is a
      // request nobody has measured, on a package whose own doc explicitly
      // separates "no parameter" (measured: 400) from "a parameter with
      // some value" (measured: 200, empty body) without ever measuring "a
      // parameter with an empty value". If ADT reads an empty string as a
      // present-but-blank category, this branch would silently start
      // answering 200 with an empty list where a caller previously got an
      // error — success fabricated from an answer nobody watched happen.
      // Refused locally instead: honest about what this branch cannot do,
      // never a guess dressed as a request.
      return return_error(
        new Error(
          'RuntimeListFeeds cannot list variants: adt-clients 19 requires a ' +
            'category argument for this endpoint, and the frozen tool surface ' +
            'has no parameter to supply one from. Use feed_type "descriptors" ' +
            'to list the feeds this system offers instead.',
        ),
      );
    case 'dumps':
      return answer(ctx, () => feeds.dumps(queryOptions), project);
    case 'system_messages':
      return answer(ctx, () => feeds.systemMessages(queryOptions), project);
    case 'gateway_errors':
      return answer(ctx, () => feeds.gatewayErrors(queryOptions), project);
    default: {
      const exhaustive: never = feedType;
      return return_error(
        new Error(`Unknown feed_type: ${String(exhaustive)}`),
      );
    }
  }
}
