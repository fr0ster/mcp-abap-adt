import { AdtRuntimeClient, FeedRepository } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  feedEntries,
  feedGatewayErrors,
  feedSystemMessages,
} from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { TIMEOUT_PROPERTY, withLongToolAdvice } from '../../../lib/longTools';
import {
  FEED_ENTRIES_CEILING,
  FEED_PAGE_DEFAULT,
  FEED_PAGE_MAX,
  type FeedPage,
  feedPage,
  feedPages,
} from '../../../lib/strategies/feedPages';
import { feedVariantsOf } from '../../../lib/strategies/feedVariants';
import { ourFeeds } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeListFeeds',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[runtime] List the ADT runtime feeds and their variants, or read one: ABAP short dumps, system messages or SAP Gateway errors, filtered by user and time range; dumps also by runtime error, exception, object, package and application component. Entries come newest first; each dump carries its dump_id. When more entries remain, next_to is the `to` that reads on; incomplete_second names a second holding more entries than SAP answers in one request.',
  ),
  inputSchema: {
    type: 'object',
    properties: {
      timeout: TIMEOUT_PROPERTY,
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
        description: 'Entries of this SAP user (exact match).',
      },
      runtime_error: {
        type: 'string',
        description:
          'Dumps whose runtime error contains this text, in any case.',
      },
      exception: {
        type: 'string',
        description:
          'Dumps whose exception class contains this text, in any case.',
      },
      object_name: {
        type: 'string',
        description:
          'Dumps whose terminated object name contains this text, in any case.',
      },
      package: {
        type: 'string',
        description:
          'Dumps whose object package contains this text, in any case.',
      },
      component: {
        type: 'string',
        description:
          'Dumps whose application component contains this text, in any case.',
      },
      max_results: {
        type: 'number',
        description: `Most entries to return, up to ${FEED_ENTRIES_CEILING}; SAP answers at most ${FEED_PAGE_MAX} per request and the pages are read in turn. An answer holds whole seconds, so it may hold a few entries fewer, or a crowded second more, than asked. Default: ${FEED_PAGE_DEFAULT}.`,
      },
      from: {
        type: 'string',
        description: 'Start of time range in YYYYMMDDHHMMSS format.',
      },
      to: {
        type: 'string',
        description:
          'End of time range in YYYYMMDDHHMMSS format, inclusive; pass a previous next_to here to read on.',
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
  runtime_error?: string;
  exception?: string;
  object_name?: string;
  package?: string;
  component?: string;
  max_results?: number;
  from?: string;
  to?: string;
}

/**
 * The dumps feed's filters and the attribute and operator each one is sent
 * as. The attributes are the ones the feed's descriptor declares
 * (`GET /sap/bc/adt/feeds`, `feed:queryAttribute`); `user` offers `equals`
 * and `notEquals` only, the others `contains` as well.
 */
const DUMP_FILTERS = [
  ['user', 'user', 'equals'],
  ['runtime_error', 'runtimeError', 'contains'],
  ['exception', 'exception', 'contains'],
  ['object_name', 'objectName', 'contains'],
  ['package', 'package', 'contains'],
  ['component', 'component', 'contains'],
] as const;

/**
 * A value is written into the expression as it stands, so what would end an
 * operand — a blank, a comma, a parenthesis — is refused rather than sent.
 */
const OPERAND = /^[^\s,()]+$/;

/**
 * The dumps feed's `$query` for the filters given — `and ( … )` of one
 * condition per filter — or nothing when none is.
 */
export function dumpQueryOf(args: RuntimeListFeedsArgs): string | undefined {
  const conditions: string[] = [];
  for (const [param, attribute, operator] of DUMP_FILTERS) {
    const value = args[param]?.trim();
    if (!value) continue;
    if (!OPERAND.test(value)) {
      throw new Error(
        `${param} must not contain blanks, commas or parentheses: "${value}"`,
      );
    }
    conditions.push(`${operator} ( ${attribute} , ${value} )`);
  }
  return conditions.length > 0
    ? `and ( ${conditions.join(' , ')} )`
    : undefined;
}

/**
 * The id `RuntimeGetDumpById` takes: the last segment of the entry's URI
 * (`/sap/bc/adt/vit/runtime/dumps/<id>`), as it stands in that URI.
 */
export function dumpIdOf(uri: string): string {
  return uri.replace(/^.*\/runtime\/dumps\//, '');
}

/**
 * The feeds client with each entries reading wrapped to keep SAP's next page
 * link — `ourFeeds` otherwise, so every other slot reads as it did.
 */
function pagedFeeds(
  connection: HandlerContext['connection'],
  logger: HandlerContext['logger'],
) {
  return new AdtRuntimeClient(connection, logger).getFeeds({
    ...ourFeeds,
    entries: feedPage(feedEntries as never),
    systemMessages: feedPage(feedSystemMessages as never),
    gatewayErrors: feedPage(feedGatewayErrors as never),
  } as never);
}

export async function handleRuntimeListFeeds(
  context: HandlerContext,
  args: RuntimeListFeedsArgs,
) {
  const { connection, logger } = context;
  const feeds = new AdtRuntimeClient(connection, logger).getFeeds(ourFeeds);
  const feedType = args?.feed_type ?? 'descriptors';

  const ctx = { tool: 'RuntimeListFeeds', detail: 'terse' as const };

  const dumpOnly = DUMP_FILTERS.filter(
    ([param]) => param !== 'user' && args?.[param]?.trim(),
  ).map(([param]) => param);
  if (feedType !== 'dumps' && dumpOnly.length > 0) {
    return return_error(
      new Error(
        `${dumpOnly.join(', ')} filter the dumps feed; feed_type is ${feedType}.`,
      ),
    );
  }

  let query: string | undefined;
  try {
    query = feedType === 'dumps' ? dumpQueryOf(args ?? {}) : undefined;
  } catch (thrown) {
    return return_error(thrown as Error);
  }

  // The request's own filters, the same on every page; `feedPages` supplies
  // `$top` and `to` per page.
  const base = {
    user: args?.user,
    query,
    from: args?.from,
  };
  const paging = { maxResults: args?.max_results, to: args?.to };
  const pageOf = (page: FeedPage<unknown>) => {
    const answered: Record<string, unknown> = {
      success: true,
      feed_type: feedType,
      count: page.entries.length,
      entries: page.entries,
    };
    if (page.next_to) answered.next_to = page.next_to;
    if (page.incomplete_second) {
      answered.incomplete_second = page.incomplete_second;
    }
    return answered;
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
      // an empty body for every feed id the system lists (2026-09-26). So the
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
    case 'dumps': {
      // Each page read by the entries reading with its next link kept.
      const dumps = pagedFeeds(connection, logger);
      return answer(
        ctx,
        () =>
          feedPages<{ id: string; updated: string }>(
            (page) =>
              dumps.dumps({
                ...base,
                ...page,
                analyse: analyseException,
              }) as never,
            paging,
            { keyOf: (entry) => entry.id, stampOf: (entry) => entry.updated },
          ),
        (page) =>
          pageOf({
            ...page,
            entries: page.entries.map((entry) => ({
              dump_id: dumpIdOf(entry.id),
              ...entry,
            })),
          }),
      );
    }
    case 'system_messages': {
      const messages = pagedFeeds(connection, logger);
      return answer(
        ctx,
        () =>
          feedPages<{ id: string; validFrom: string }>(
            (page) =>
              messages.systemMessages({
                ...base,
                ...page,
                analyse: analyseException,
              }) as never,
            paging,
            {
              keyOf: (entry) => entry.id,
              stampOf: (entry) => entry.validFrom,
            },
          ),
        pageOf,
      );
    }
    case 'gateway_errors': {
      const errors = pagedFeeds(connection, logger);
      return answer(
        ctx,
        () =>
          feedPages<{ transactionId: string; dateTime: string }>(
            (page) =>
              errors.gatewayErrors({
                ...base,
                ...page,
                analyse: analyseException,
              }) as never,
            paging,
            {
              keyOf: (entry) => `${entry.transactionId}|${entry.dateTime}`,
              stampOf: (entry) => entry.dateTime,
            },
          ),
        pageOf,
      );
    }
    default: {
      const exhaustive: never = feedType;
      return return_error(
        new Error(`Unknown feed_type: ${String(exhaustive)}`),
      );
    }
  }
}

/** The most entries SAP answers in one request (measured). */
export const FEED_PAGE_CAP = FEED_PAGE_MAX;

const PAGE_FEEDS = {
  dumps: 'read dumps',
  system_messages: 'read system messages',
  gateway_errors: 'read gateway errors',
} as const;

/**
 * Compact: one page of a runtime feed — one request, answered as SAP gave it.
 * `top` is the request's `$top` (at most {@link FEED_PAGE_CAP}), `to` its
 * upper bound, and `next_to` the `to` of SAP's next link as it came; the
 * next link's page starts at the boundary second, inclusive.
 */
export async function handleRuntimeListFeedPage(
  context: HandlerContext,
  args: Omit<RuntimeListFeedsArgs, 'feed_type'> & {
    feed_type?: keyof typeof PAGE_FEEDS;
    top?: number;
  },
  tool = 'HandlerDumpList',
) {
  const { connection, logger } = context;
  const feedType = args?.feed_type ?? 'dumps';
  const step = PAGE_FEEDS[feedType];
  if (!step) {
    return return_error(new Error(`Unknown feed_type: ${String(feedType)}`));
  }
  const top = args?.top;
  if (
    top !== undefined &&
    (typeof top !== 'number' ||
      !Number.isInteger(top) ||
      top < 1 ||
      top > FEED_PAGE_CAP)
  ) {
    return return_error(
      new Error(
        `top must be a whole number from 1 to ${FEED_PAGE_CAP}, the most entries SAP answers in one request; read on with the next_to of the answer as to.`,
      ),
    );
  }
  const dumpOnly = DUMP_FILTERS.filter(
    ([param]) => param !== 'user' && args?.[param]?.trim(),
  ).map(([param]) => param);
  if (feedType !== 'dumps' && dumpOnly.length > 0) {
    return return_error(
      new Error(
        `${dumpOnly.join(', ')} filter the dumps feed; feed_type is ${feedType}.`,
      ),
    );
  }
  let query: string | undefined;
  try {
    query = feedType === 'dumps' ? dumpQueryOf(args ?? {}) : undefined;
  } catch (thrown) {
    return return_error(thrown as Error);
  }
  const base = { user: args?.user, query, from: args?.from };
  const page = { maxResults: top, to: args?.to };
  const feeds = pagedFeeds(connection, logger);
  const ctx = { tool, detail: 'terse' as const };
  const shown = (read: FeedPage<unknown>) => {
    const answered: Record<string, unknown> = {
      success: true,
      feed_type: feedType,
      count: read.entries.length,
      entries: read.entries,
    };
    if (read.next_to) answered.next_to = read.next_to;
    return answered;
  };
  switch (feedType) {
    case 'dumps':
      return answer(
        ctx,
        () =>
          atStep(step, () =>
            feeds.dumps({ ...base, ...page, analyse: analyseException }),
          )() as never,
        (read: FeedPage<{ id: string }>) =>
          shown({
            ...read,
            entries: read.entries.map((entry) => ({
              dump_id: dumpIdOf(entry.id),
              ...entry,
            })),
          }),
      );
    case 'system_messages':
      return answer(
        ctx,
        () =>
          atStep(step, () =>
            feeds.systemMessages({
              ...base,
              ...page,
              analyse: analyseException,
            }),
          )() as never,
        shown,
      );
    default:
      return answer(
        ctx,
        () =>
          atStep(step, () =>
            feeds.gatewayErrors({
              ...base,
              ...page,
              analyse: analyseException,
            }),
          )() as never,
        shown,
      );
  }
}
