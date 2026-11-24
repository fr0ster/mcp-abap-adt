import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import type {
  IFeedDescriptor,
  IFeedEntry,
  IGatewayErrorEntry,
  ISystemMessageEntry,
} from '@mcp-abap-adt/adt-strategies';
import {
  analyseException,
  feedEntries,
  feedGatewayErrors,
  feedSystemMessages,
} from '@mcp-abap-adt/adt-strategies';
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import * as z from 'zod';
import {
  answer,
  answerPayload,
  answerThrown,
  failedPayloadOf,
  isCredentialPayload,
  type ListedAnswer,
  listedAnswer,
  type McpResult,
} from '../../../lib/answer';
import { failureOf } from '../../../lib/auth/failures';
import {
  type PhaseResult,
  runPhase,
  withSequentialFallback,
} from '../../../lib/batch/phases';
import { withSystemKindOf } from '../../../lib/connectionFactory';
import {
  type DescriptionParts,
  longRunning,
  purpose,
  returnsOf,
  toolDescription,
} from '../../../lib/description';
import {
  about,
  asJsonResult,
  asTextResult,
  byListing,
  type DetailLevel,
  type Head,
  headLines,
  headShape,
  type ListAnswerTable,
  type Listing,
  listAnswerAt,
  nest,
  parts,
  partsOf,
  type RowSchemas,
  rows,
  shapesOf,
  type TextResult,
  values,
  type Written,
  wireAnswer,
  within,
  writeJsonList,
  writeListing,
  writeWhole,
} from '../../../lib/detail';
import {
  DUMP_FILTERS,
  dumpFiltersRefusal,
  isOperand,
} from '../../../lib/dumpFilters';
import { withInCallSchema } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { JsonValue } from '../../../lib/json';
import { LONG_BACKGROUND_FIELD } from '../../../lib/longTools';
import { afterLast } from '../../../lib/plainText';
import {
  ASSEMBLED_DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import {
  FEED_ENTRIES_CEILING,
  FEED_PAGE_DEFAULT,
  FEED_PAGE_MAX,
  type FeedPage,
  feedPage,
  feedPages,
} from '../../../lib/strategies/feedPages';
import {
  type FeedVariants,
  feedVariantsOf,
} from '../../../lib/strategies/feedVariants';
import { ourFeeds } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';
import { detailKindOf } from './handleRuntimeGetGatewayErrorLog';

/** A page of a feed as answered, in this order. */
type FeedPageAnswer<T> = {
  success: true;
  feed_type: string;
  count: number;
  entries: T[];
  next_to?: string;
  incomplete_second?: string;
};

/** RuntimeListFeeds's arguments but `background`. */
const FIELDS = {
  feed_type: z
    .enum([
      'descriptors',
      'variants',
      'dumps',
      'system_messages',
      'gateway_errors',
    ])
    .optional()
    .describe(
      'Feed to read. "descriptors" lists available feeds, "variants" lists feed variants, others read that specific feed. Default: descriptors.',
    ),
  feed_types: z
    .array(
      z.enum([
        'descriptors',
        'variants',
        'dumps',
        'system_messages',
        'gateway_errors',
      ]),
    )
    .optional()
    .describe(
      'Several feeds, read together with the same filters (give this or feed_type).',
    ),
  user: z
    .string()
    .optional()
    .describe('Entries of this SAP user (exact match).'),
  runtime_error: z
    .string()
    .optional()
    .describe('Dumps whose runtime error contains this text, in any case.'),
  exception: z
    .string()
    .optional()
    .describe('Dumps whose exception class contains this text, in any case.'),
  object_name: z
    .string()
    .optional()
    .describe(
      'Dumps whose terminated object name contains this text, in any case.',
    ),
  package: z
    .string()
    .optional()
    .describe('Dumps whose object package contains this text, in any case.'),
  component: z
    .string()
    .optional()
    .describe(
      'Dumps whose application component contains this text, in any case.',
    ),
  max_results: z
    .number()
    .optional()
    .describe(
      `Most entries to return, up to ${FEED_ENTRIES_CEILING}; SAP answers at most ${FEED_PAGE_MAX} per request and the pages are read in turn. An answer holds whole seconds, so it may hold a few entries fewer, or a crowded second more, than asked. Default: ${FEED_PAGE_DEFAULT}.`,
    ),
  from: z
    .string()
    .optional()
    .describe('Start of time range in YYYYMMDDHHMMSS format.'),
  to: z
    .string()
    .optional()
    .describe(
      'End of time range in YYYYMMDDHHMMSS format, inclusive; pass a previous next_to here to read on.',
    ),
  ...ASSEMBLED_DETAIL_SHAPE,
};

/**
 * One feed (`feed_type`, by default the descriptors) or a non-empty
 * `feed_types` alone; for one feed, the dumps filters only on the dumps
 * feed, each a single operand.
 */
function oneFeedForm(
  args: {
    feed_type?: string | undefined;
    feed_types?: readonly string[] | undefined;
    user?: string | undefined;
    runtime_error?: string | undefined;
    exception?: string | undefined;
    object_name?: string | undefined;
    package?: string | undefined;
    component?: string | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const refuse = (message: string, path: string) =>
    ctx.addIssue({ code: 'custom', message, path: [path] });
  if (args.feed_types !== undefined) {
    if (args.feed_type !== undefined || args.feed_types.length === 0) {
      refuse(
        'Give exactly one of feed_type or feed_types (a non-empty list of feed types).',
        'feed_types',
      );
    }
    return;
  }
  const feedType = args.feed_type ?? 'descriptors';
  const refused = dumpFiltersRefusal(feedType, args);
  if (refused !== undefined) refuse(refused.words, refused.path);
}

type RuntimeListFeedsArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * The dumps feed's `$query` for the filters given — `and ( … )` of one
 * condition per filter — or nothing when none is.
 */
export function dumpQueryOf(args: RuntimeListFeedsArgs): string | undefined {
  const conditions: string[] = [];
  for (const [param, attribute, operator] of DUMP_FILTERS) {
    const value = args[param]?.trim();
    if (!value) continue;
    if (!isOperand(value)) {
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
  return afterLast(uri, '/runtime/dumps/');
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
    entries: feedPage(feedEntries),
    systemMessages: feedPage(feedSystemMessages),
    gatewayErrors: feedPage(feedGatewayErrors),
  });
}

/** What a feed read answered, by feed: the payload each level formats. */
export type FeedShown =
  | {
      readonly feed: 'descriptors';
      readonly answered: { count: number; entries: readonly IFeedDescriptor[] };
    }
  | {
      readonly feed: 'variants';
      readonly answered: { count: number; entries: readonly FeedVariants[] };
    }
  | {
      readonly feed: 'dumps';
      readonly answered: FeedPageAnswer<{
        dump_id: string;
        updated: string;
        title: string;
      }>;
    }
  | {
      readonly feed: 'system_messages';
      readonly answered: FeedPageAnswer<ISystemMessageEntry>;
    }
  | {
      readonly feed: 'gateway_errors';
      readonly answered: FeedPageAnswer<IGatewayErrorEntry>;
    };

/** One variant of a feed. */
type FeedVariant = FeedVariants['variants'][number];

/** One row of the variants feed: a feed with one of its variants, or with none. */
interface VariantRow {
  readonly feed: string;
  readonly variant: FeedVariant | undefined;
}

/** The variants feed as its rows: every variant of every feed, a feed without any once. */
interface VariantRows {
  readonly rows: readonly VariantRow[];
}

/** Every variant of every feed; a feed without variants is one row with none. */
function variantRows(feeds: readonly FeedVariants[]): VariantRow[] {
  return feeds.flatMap((feed): VariantRow[] =>
    feed.variants.length === 0
      ? [{ feed: feed.feed, variant: undefined }]
      : feed.variants.map((variant) => ({ feed: feed.feed, variant })),
  );
}

/** A feed's answer, by its feed. */
type FeedAnswer<F extends FeedShown['feed']> = Extract<
  FeedShown,
  { readonly feed: F }
>['answered'];

/** A feed's answer as its terse listing reads it: under the member its feed names. */
interface FeedTerse {
  readonly heads: readonly Head[];
  readonly descriptors?: FeedAnswer<'descriptors'> | undefined;
  readonly variants?: VariantRows | undefined;
  readonly dumps?: FeedAnswer<'dumps'> | undefined;
  readonly system_messages?: FeedAnswer<'system_messages'> | undefined;
  readonly gateway_errors?: FeedAnswer<'gateway_errors'> | undefined;
}

/** A feed read as its terse listing reads it. */
function feedTerse(shown: FeedShown): FeedTerse {
  const heads = feedHeads(shown);
  switch (shown.feed) {
    case 'descriptors':
      return { heads, descriptors: shown.answered };
    case 'variants':
      return { heads, variants: { rows: variantRows(shown.answered.entries) } };
    case 'dumps':
      return { heads, dumps: shown.answered };
    case 'system_messages':
      return { heads, system_messages: shown.answered };
    case 'gateway_errors':
      return { heads, gateway_errors: shown.answered };
  }
}

/** Each feed's entries: one row per entry — a feed without variants one row with none. */
export const FEED_SCHEMAS: RowSchemas<FeedTerse> = {
  // The feed, its count and SAP's paging, before its entries.
  heads: headLines('heads'),
  descriptors: within<FeedAnswer<'descriptors'>, 'descriptors'>('descriptors', {
    entries: about(
      'for each feed there is',
      rows('entries', {
        header: 'always',
        columns: [
          { name: 'id', means: 'its ID', cell: (e: IFeedDescriptor) => e.id },
          {
            name: 'title',
            means: 'its title',
            cell: (e: IFeedDescriptor) => e.title,
          },
          {
            name: 'category',
            means: 'its category',
            cell: (e: IFeedDescriptor) => e.category ?? '',
          },
        ],
      }),
    ),
  }),
  variants: within<VariantRows, 'variants'>('variants', {
    // Every variant of every feed; a feed without variants a row with none.
    rows: about(
      'for each variant of a feed',
      rows('rows', {
        columns: [
          {
            name: 'feed',
            means: 'its feed',
            cell: (row: VariantRow) => row.feed,
          },
          {
            name: 'title',
            means: 'its title',
            cell: (row: VariantRow) => row.variant?.title ?? '',
          },
          {
            name: 'query',
            means: 'its query',
            cell: (row: VariantRow) => row.variant?.query ?? '',
          },
          {
            name: 'is_default',
            means: 'whether it is the default',
            cell: (row: VariantRow) =>
              row.variant === undefined ? '' : String(row.variant.is_default),
          },
        ],
        header: 'always',
      }),
    ),
  }),
  dumps: within<FeedAnswer<'dumps'>, 'dumps'>('dumps', {
    entries: about(
      'for each short dump, newest first',
      rows('entries', {
        header: 'always',
        columns: [
          {
            name: 'dump_id',
            means: 'its dump ID',
            cell: (e: DumpEntry) => e.dump_id,
          },
          {
            name: 'updated',
            means: 'when it happened',
            cell: (e: DumpEntry) => e.updated,
          },
          {
            name: 'title',
            means: 'its title',
            cell: (e: DumpEntry) => e.title,
          },
        ],
      }),
    ),
  }),
  system_messages: within<FeedAnswer<'system_messages'>, 'system_messages'>(
    'system_messages',
    {
      entries: about(
        'for each system message',
        rows('entries', {
          header: 'always',
          columns: [
            {
              name: 'id',
              means: 'its ID',
              cell: (e: ISystemMessageEntry) => e.id ?? e.messageId ?? '',
            },
            {
              name: 'createdOn',
              means: 'when it was created',
              cell: (e: ISystemMessageEntry) => e.createdOn ?? '',
            },
            {
              name: 'author',
              means: 'its author',
              cell: (e: ISystemMessageEntry) => e.author ?? e.createdBy ?? '',
            },
            {
              name: 'title',
              means: 'its title',
              cell: (e: ISystemMessageEntry) => e.title ?? '',
            },
          ],
        }),
      ),
    },
  ),
  gateway_errors: within<FeedAnswer<'gateway_errors'>, 'gateway_errors'>(
    'gateway_errors',
    {
      entries: about(
        'for each SAP Gateway error',
        rows('entries', {
          header: 'always',
          columns: [
            {
              name: 'opid',
              means: 'its operation ID',
              cell: (e: IGatewayErrorEntry) => e.opid ?? '',
            },
            {
              name: 'detail_kind',
              means: 'the kind of its detail',
              cell: (e: IGatewayErrorEntry) => detailKindOf(e),
            },
            {
              name: 'dateTime',
              means: 'when it happened',
              cell: (e: IGatewayErrorEntry) => e.dateTime ?? '',
            },
            {
              name: 'type',
              means: 'its type',
              cell: (e: IGatewayErrorEntry) => e.type ?? '',
            },
            {
              name: 'shortText',
              means: 'its short text',
              cell: (e: IGatewayErrorEntry) => e.shortText ?? '',
            },
            {
              name: 'username',
              means: 'the user it happened to',
              cell: (e: IGatewayErrorEntry) => e.username ?? '',
            },
          ],
        }),
      ),
    },
  ),
};

/** The heads a feed's listing opens with. */
export const FEED_HEADS = [
  headShape('count', 'how many items it holds'),
  headShape('next_to', 'where the next read starts when more remain'),
  headShape(
    'incomplete_second',
    'the second holding more items than one read gives',
  ),
];

/**
 * One page of one feed of entries, as the compact `HandlerDumpList` reads it:
 * the dumps, the system messages or the Gateway errors, under the feed's
 * heads — the feeds' own schemas, the descriptors and variants unread.
 */
export const FEED_PAGE_PARTS: DescriptionParts = {
  tag: 'read-only',
  purpose: purpose(
    'Reads one page of the short dumps, system messages or SAP Gateway errors of an ABAP system, newest first, by user, object and time.',
  ),
  returns: returnsOf({
    heads: FEED_HEADS,
    of: 'for the feed read:',
    shapes: [
      shapesOf({
        heads: FEED_SCHEMAS.heads,
        dumps: FEED_SCHEMAS.dumps,
        system_messages: FEED_SCHEMAS.system_messages,
        gateway_errors: FEED_SCHEMAS.gateway_errors,
      }),
    ],
  }),
  notes: [longRunning],
};

export const TOOL_DEFINITION = {
  name: 'RuntimeListFeeds',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads the runtime feeds of an ABAP system: its short dumps, system messages or SAP Gateway errors by user and time, or the feeds there are and their variants.',
    ),
    returns: returnsOf({
      heads: FEED_HEADS,
      of: 'for the feed read:',
      shapes: [shapesOf(FEED_SCHEMAS)],
    }),
    notes: [longRunning],
  }),
  inputSchema: withInCallSchema(
    z
      .object({ background: LONG_BACKGROUND_FIELD, ...FIELDS })
      .superRefine(oneFeedForm),
    z.object(FIELDS).superRefine(oneFeedForm),
  ),
} as const;

/** A feed's entries as written, under its heads. */
function feedListing(read: FeedTerse): Listing<FeedTerse> {
  return { heads: [], reading: read, lists: FEED_SCHEMAS };
}

/** A dump entry as the dumps feed answers it. */
interface DumpEntry {
  readonly dump_id: string;
  readonly updated: string;
  readonly title: string;
}

/** A feed's heads: the feed, its count, and SAP's paging where it has more. */
function feedHeads(shown: FeedShown): Head[] {
  const paged =
    shown.feed === 'descriptors' || shown.feed === 'variants'
      ? { next_to: undefined, incomplete_second: undefined }
      : shown.answered;
  return [
    { head: 'feed', value: shown.feed },
    { head: 'count', value: String(shown.answered.count) },
    ...(paged.next_to ? [{ head: 'next_to', value: paged.next_to }] : []),
    ...(paged.incomplete_second
      ? [{ head: 'incomplete_second', value: paged.incomplete_second }]
      : []),
  ];
}

/** A feed's terse text: TSV under its `# feed` and `# count` lines, every entry a row. */
export function terseFeedText(shown: FeedShown): Written<string> {
  return writeListing(feedListing(feedTerse(shown)));
}

/**
 * What `RuntimeListFeeds` answers at each `detail`, selected by the handler
 * before the reads (`src/lib/detail`): terse a feed's rows as TSV, medium,
 * full and raw the former JSON, every field.
 */
const FEED_ANSWERS: ListAnswerTable<FeedShown, string | object> = {
  terse: terseFeedText,
  // The feed's answer whole, as it is: complete by construction.
  medium: (shown) => writeWhole(shown.answered),
  full: (shown) => shown.answered,
  raw: (shown) => shown.answered,
};

/**
 * Each answered feed's read, by the answer it became: a list call writes
 * every feed's terse text from these by the listing writer, never by splicing
 * the single answers' texts.
 */
const readsOf = new WeakMap<McpResult, FeedShown>();

/** One feed's answer at its level, its read kept for a list call. */
async function feedsOf(
  context: HandlerContext,
  args: RuntimeListFeedsArgs,
  shown: (feed: FeedShown) => string | object,
): Promise<McpResult> {
  const seen: { read?: FeedShown } = {};
  const result = await feedOf(context, args, (feed) => {
    seen.read = feed;
    return shown(feed);
  });
  if (seen.read !== undefined && !result.isError) {
    readsOf.set(result, seen.read);
  }
  return result;
}

async function feedOf(
  context: HandlerContext,
  args: RuntimeListFeedsArgs,
  shown: (feed: FeedShown) => string | object,
): Promise<McpResult> {
  const { connection, logger } = context;
  const feeds = new AdtRuntimeClient(connection, logger).getFeeds(ourFeeds);
  const feedType = args?.feed_type ?? 'descriptors';

  // A feed of a `feed_types` list answers the refusal as its own entry.
  const refused = dumpFiltersRefusal(feedType, args);
  if (refused !== undefined) return return_error(new Error(refused.words));

  let query: string | undefined;
  try {
    query = feedType === 'dumps' ? dumpQueryOf(args ?? {}) : undefined;
  } catch (thrown) {
    return return_error(thrown);
  }

  // The request's own filters, the same on every page; `feedPages` supplies
  // `$top` and `to` per page.
  const base = {
    user: args?.user,
    query,
    from: args?.from,
  };
  const paging = { maxResults: args?.max_results, to: args?.to };
  const pageOf = <T>(page: FeedPage<T>) => {
    const answered: FeedPageAnswer<T> = {
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
  const project = <E>(entries: readonly E[]) => ({
    success: true,
    feed_type: feedType,
    count: entries.length,
    entries,
  });

  switch (feedType) {
    case 'descriptors':
      return answer(
        { tool: 'RuntimeListFeeds', detail: detailOf(args) },
        () => feeds.list({ analyse: analyseException }),
        (entries) => shown({ feed: 'descriptors', answered: project(entries) }),
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
        { tool: 'RuntimeListFeeds', detail: detailOf(args) },
        () =>
          new AdtRuntimeClient(connection, logger)
            .getFeeds({ ...ourFeeds, feeds: feedVariantsOf })
            .list({ analyse: analyseException }),
        (entries) => shown({ feed: 'variants', answered: project(entries) }),
      );
    case 'dumps': {
      // Each page read by the entries reading with its next link kept.
      const dumps = pagedFeeds(connection, logger);
      return answer(
        { tool: 'RuntimeListFeeds', detail: detailOf(args) },
        () =>
          feedPages<IFeedEntry>(
            (page) =>
              dumps.dumps({
                ...base,
                ...page,
                analyse: analyseException,
              }),
            paging,
            { keyOf: (entry) => entry.id, stampOf: (entry) => entry.updated },
          ),
        (page) =>
          shown({
            feed: 'dumps',
            answered: pageOf({
              ...page,
              entries: page.entries.map((entry) => ({
                dump_id: dumpIdOf(entry.id),
                ...entry,
              })),
            }),
          }),
      );
    }
    case 'system_messages': {
      const messages = pagedFeeds(connection, logger);
      return answer(
        { tool: 'RuntimeListFeeds', detail: detailOf(args) },
        () =>
          feedPages<ISystemMessageEntry>(
            (page) =>
              messages.systemMessages({
                ...base,
                ...page,
                analyse: analyseException,
              }),
            paging,
            // A message is identified by its entry id, and the feed is
            // ordered by its `atom:updated` (adt-strategies 0.28.0: SAP
            // writes no validity; `validFrom` read the creation time).
            {
              keyOf: (entry) => entry.id ?? entry.messageId ?? '',
              stampOf: (entry) => entry.updated,
            },
          ),
        (page) => shown({ feed: 'system_messages', answered: pageOf(page) }),
      );
    }
    case 'gateway_errors': {
      const errors = pagedFeeds(connection, logger);
      return answer(
        { tool: 'RuntimeListFeeds', detail: detailOf(args) },
        () =>
          feedPages<IGatewayErrorEntry>(
            (page) =>
              errors.gatewayErrors({
                ...base,
                ...page,
                analyse: analyseException,
              }),
            paging,
            // An error is identified by its entry id (adt-strategies 0.28.0:
            // `transactionId` is the summary's cell now, the `atom:id` is
            // `id`), and the feed is ordered by its date and time.
            {
              keyOf: (entry) =>
                entry.id ??
                `${entry.transactionId ?? ''}|${entry.dateTime ?? ''}`,
              stampOf: (entry) => entry.dateTime,
            },
          ),
        (page) => shown({ feed: 'gateway_errors', answered: pageOf(page) }),
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
  args: FeedPageArgs,
  tool = 'HandlerDumpList',
) {
  // One page is one read: at `raw` its document, as SAP sent it.
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      { connection: context.connection, tool: tool, shape: 'one' },
      () => answeredFeedPage(context, { ...args, detail: 'full' }, tool),
    );
  }
  return answeredFeedPage(context, args, tool);
}

/** What one page of a feed is asked with. */
type FeedPageArgs = Omit<RuntimeListFeedsArgs, 'feed_type'> & {
  feed_type?: keyof typeof PAGE_FEEDS | undefined;
  top?: number | undefined;
};

async function answeredFeedPage(
  context: HandlerContext,
  args: FeedPageArgs,
  tool: string,
) {
  const { connection, logger } = context;
  const feedType = args?.feed_type ?? 'dumps';
  const step = PAGE_FEEDS[feedType];
  // `HandlerDumpList`'s schema holds the rules: `top` one page at most, the
  // dumps filters on the dumps feed alone, each one operand.
  const top = args?.top;
  let query: string | undefined;
  try {
    query = feedType === 'dumps' ? dumpQueryOf(args ?? {}) : undefined;
  } catch (thrown) {
    return return_error(thrown);
  }
  const base = { user: args?.user, query, from: args?.from };
  const page = { maxResults: top, to: args?.to };
  const feeds = pagedFeeds(connection, logger);
  // The page at the level asked, as RuntimeListFeeds answers a feed (compact
  // parity): terse its rows, medium and full the JSON.
  const atLevel = listAnswerAt(FEED_ANSWERS, levelOf(args));
  const shown = <T>(read: FeedPage<T>) => {
    const answered: FeedPageAnswer<T> = {
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
        { tool, detail: detailOf(args) },
        () =>
          atStep(step, () =>
            feeds.dumps({ ...base, ...page, analyse: analyseException }),
          )(),
        (read: FeedPage<IFeedEntry>) =>
          atLevel({
            feed: 'dumps',
            answered: shown({
              ...read,
              entries: read.entries.map((entry) => ({
                dump_id: dumpIdOf(entry.id),
                ...entry,
              })),
            }),
          }),
      );
    case 'system_messages':
      return answer(
        { tool, detail: detailOf(args) },
        () =>
          atStep(step, () =>
            feeds.systemMessages({
              ...base,
              ...page,
              analyse: analyseException,
            }),
          )(),
        (read: FeedPage<ISystemMessageEntry>) =>
          atLevel({ feed: 'system_messages', answered: shown(read) }),
      );
    default:
      return answer(
        { tool, detail: detailOf(args) },
        () =>
          atStep(step, () =>
            feeds.gatewayErrors({
              ...base,
              ...page,
              analyse: analyseException,
            }),
          )(),
        (read: FeedPage<IGatewayErrorEntry>) =>
          atLevel({ feed: 'gateway_errors', answered: shown(read) }),
      );
  }
}

/** A request a feed's read made, waiting for its round. */
interface Asked {
  request: IAbapRequestOptions;
  resolve: (response: IAdtWireResponse) => void;
  reject: (error: unknown) => void;
}

/** One feed's read in the rounds: its request waiting, and the signal it was made. */
interface RoundState {
  asked: Promise<void>;
  signal: () => void;
  pending: Asked | undefined;
}

/** The fixed words of a request made once the rounds have ended. */
const ROUNDS_ENDED_WORDS =
  'the feeds read in envelopes have ended: no further request is sent';

/**
 * A connection for one feed's read whose requests wait for their round:
 * `ask` holds each one until the round sends it, and settles it with the
 * part's answer. It has `connection`'s system kind, as every view over a
 * connection has (`withSystemKindOf`).
 */
export function roundConnection(
  connection: HandlerContext['connection'],
  ask: (request: IAbapRequestOptions) => Promise<IAdtWireResponse>,
): HandlerContext['connection'] {
  // `getSessionType`, optional in the contract: this view states its session.
  const view: HandlerContext['connection'] & {
    getSessionType(): 'stateful' | 'stateless';
  } = {
    connect: () => connection.connect(),
    getBaseUrl: () => connection.getBaseUrl(),
    getSessionId: () => connection.getSessionId(),
    // A feed's requests go in the round's envelope, a stateless read: the
    // feed sets no session type of its own.
    setSessionType: (_type: 'stateful' | 'stateless') => undefined,
    getSessionType: (): 'stateful' | 'stateless' => 'stateless',
    makeAdtRequest(request: IAbapRequestOptions): Promise<IAdtWireResponse> {
      return ask(request);
    },
  };
  return withSystemKindOf(view, connection);
}

/** What the rounds answer: every feed's answer, or the one that ends the call. */
type RoundsOutcome = { answers: McpResult[] } | { ended: McpResult };

/**
 * Every feed's read (`read(i, connection)`, the sequential version's call)
 * on a connection of its own, its requests sent in rounds (spec §11): each
 * round is one envelope (`runPhase`) holding the one request every feed
 * still reading has made — the first GET of every feed, then the next page
 * of every feed still paging, which needs its own feed's previous answer.
 * A round is sent once every feed has made its request or answered. A
 * credential failure ends the call: SAP's `401` to any feed, the first in
 * the order of the feeds, is the call's answer and no further round is
 * sent; a refusal the connection throws is thrown, as `runPhase` throws it.
 */
async function feedsInRounds(
  context: HandlerContext,
  count: number,
  read: (
    i: number,
    connection: HandlerContext['connection'],
  ) => Promise<McpResult>,
): Promise<RoundsOutcome> {
  let ended = false;
  const states = Array.from({ length: count }, (): RoundState => {
    // Replaced by the promise's resolver, which its executor hands over at once.
    let signal: () => void = () => {};
    const asked = new Promise<void>((resolve) => {
      signal = resolve;
    });
    return { asked, signal, pending: undefined };
  });
  const settled = states.map((state, i) =>
    (async () =>
      read(
        i,
        roundConnection(
          context.connection,
          (request) =>
            new Promise<IAdtWireResponse>((resolve, reject) => {
              if (ended) {
                reject(new Error(ROUNDS_ENDED_WORDS));
                return;
              }
              state.pending = { request, resolve, reject };
              state.signal();
            }),
        ),
      ))().then(
      (value): PhaseResult<McpResult> => ({ ok: true, value }),
      (error: unknown): PhaseResult<McpResult> => ({ ok: false, error }),
    ),
  );
  /** Ends the rounds: every request waiting is refused, every read settles. */
  const end = async (error: unknown) => {
    ended = true;
    for (const state of states) {
      state.pending?.reject(error);
      state.pending = undefined;
    }
    await Promise.all(settled);
  };

  for (;;) {
    // Every feed has made its request or answered.
    await Promise.all(
      states.map((state, i) => Promise.race([state.asked, settled[i]])),
    );
    for (const [i, state] of states.entries()) {
      if (state.pending !== undefined) continue;
      const result = await settled[i];
      if (result?.ok && endsList(result.value)) {
        await end(new Error(ROUNDS_ENDED_WORDS));
        return { ended: result.value };
      }
    }
    const round: Asked[] = [];
    for (const state of states) {
      const asked = state.pending;
      if (asked === undefined) continue;
      state.pending = undefined;
      state.asked = new Promise<void>((resolve) => {
        state.signal = resolve;
      });
      round.push(asked);
    }
    if (round.length === 0) break;
    let answers: PhaseResult<IAdtWireResponse>[];
    try {
      answers = await runPhase(context, round, (asked, batch) =>
        batch.makeAdtRequest(asked.request),
      );
    } catch (error) {
      round.forEach((asked) => {
        asked.reject(error);
      });
      await end(error);
      throw error;
    }
    round.forEach((asked, k) => {
      const answer = answers[k];
      if (answer?.ok) asked.resolve(answer.value);
      else asked.reject(answer?.error);
    });
  }

  const answers: McpResult[] = [];
  for (const result of await Promise.all(settled)) {
    if (!result.ok) throw result.error;
    answers.push(result.value);
  }
  return { answers };
}

/** An answer's payload: its JSON, else its text. */
function payloadOfAnswer(result: McpResult): JsonValue {
  return answerPayload(result);
}

/** Whether an answer is a credential failure: it ends a call for several feeds. */
function endsList(result: McpResult): boolean {
  const failed = failedPayloadOf(result, 'read feed');
  return failed !== undefined && isCredentialPayload(failed);
}

/** What a list call answers from: the entries asked, and each one's answer. */
interface ListOf {
  readonly feedTypes: readonly string[];
  readonly results: readonly McpResult[];
}

/**
 * A list call's answer at each `detail`, selected through the table like
 * every other answer: terse one text written by the listing writer, the other
 * levels a JSON array of the entries.
 */
const LIST_ANSWERS: ListAnswerTable<ListOf, McpResult> = {
  terse: terseList,
  medium: jsonList,
  full: (list) => jsonList(list).answer,
  raw: (list) => jsonList(list).answer,
};

/** A list call's answer: one entry per asked, in the order asked, at the level asked. */
function listAnswer(
  feedTypes: readonly string[],
  results: readonly McpResult[],
  level: DetailLevel,
): McpResult {
  return listAnswerAt(LIST_ANSWERS, level)({ feedTypes, results });
}

/** A list call's terse text. */
function terseList({ feedTypes, results }: ListOf): Written<TextResult> {
  // Every feed's text written by the listing writer: a failure under its
  // escaped `# feed` line and one `# error` line; an answered one as its
  // own terse listing.
  const text = writeListing({
    heads: [],
    reading: {
      answered: results.map((result, i) => ({
        feed: feedTypes[i] ?? '',
        answer: answerPayload(result),
        read: (() => {
          const shown = result.isError ? undefined : readsOf.get(result);
          return shown === undefined ? undefined : feedTerse(shown);
        })(),
      })),
    },
    lists: {
      answered: partsOf(
        'answered',
        ({ feed, answer, read }: AnsweredFeed): Head[] =>
          read === undefined
            ? [
                { head: 'feed', value: feed },
                {
                  head: 'error',
                  value: JSON.stringify(answer),
                },
              ]
            : [],
        'read',
        byListing(FEED_SCHEMAS, feedListing),
      ),
    },
  });
  return asTextResult(text);
}

/** One feed of a list call: its type, its answer, and its read when answered. */
interface AnsweredFeed {
  readonly feed: string;
  readonly answer: JsonValue;
  readonly read: FeedTerse | undefined;
}

/** A list call's entries as a JSON array. */
function jsonList({ feedTypes, results }: ListOf): Written<TextResult> {
  // Every answer one entry, written by the listing writer.
  return asJsonResult(
    writeJsonList(
      { answered: results.map(listedAnswer) },
      values('answered', ({ isError, answer, i }: ListedAnswer) =>
        ((isError, answer, i) =>
          isError ? { feed_type: feedTypes[i], error: answer } : answer)(
          isError,
          answer,
          i,
        ),
      ),
    ),
  );
}

/** The feeds read page by page: more than one request a call. */
const PAGED_FEEDS = new Set(['dumps', 'system_messages', 'gateway_errors']);

/**
 * The runtime feeds, one or several: the paged feeds' requests in ADT batch
 * envelopes, one round at a time; the sequential reads where the
 * destination has no communication batch. One feed of one request (the
 * descriptors or the variants) is sent as itself.
 *
 * At `raw` what ADT sent: the documents the call's reads answered, read
 * with the tool at full (`wireAnswer`, `src/lib/detail/wire.ts`).
 */
export async function handleRuntimeListFeeds(
  context: HandlerContext,
  args: RuntimeListFeedsArgs,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'RuntimeListFeeds',
        shape: 'assembled',
      },
      () => answeredRuntimeListFeeds(context, { ...args, detail: 'full' }),
    );
  }
  return answeredRuntimeListFeeds(context, args);
}

async function answeredRuntimeListFeeds(
  context: HandlerContext,
  args: RuntimeListFeedsArgs,
) {
  const ctx = { tool: 'RuntimeListFeeds', detail: detailOf(args) };
  const shown = listAnswerAt(FEED_ANSWERS, levelOf(args));
  const listed = args?.feed_types;
  if (listed === undefined) {
    if (!PAGED_FEEDS.has(String(args?.feed_type))) {
      return feedsOf(context, args, shown);
    }
    return withSequentialFallback<McpResult>(
      context,
      async () => {
        try {
          const outcome = await feedsInRounds(context, 1, (_i, connection) =>
            feedsOf({ ...context, connection }, args, shown),
          );
          return 'ended' in outcome ? outcome.ended : outcome.answers[0];
        } catch (error) {
          // A refusal the connection threw: as `answer()` renders a throw of
          // the sequential version's call.
          if (failureOf(error) === undefined) throw error;
          return answerThrown(error, ctx);
        }
      },
      () => feedsOf(context, args, shown),
    );
  }
  // The schema holds the rule: one feed, or a non-empty `feed_types`.
  const { feed_types: _list, ...rest } = args;
  const single = (
    feedType: RuntimeListFeedsArgs['feed_type'],
  ): RuntimeListFeedsArgs => ({
    ...rest,
    feed_type: feedType,
  });
  return withSequentialFallback<McpResult>(
    context,
    async () => {
      try {
        const outcome = await feedsInRounds(
          context,
          listed.length,
          (i, connection) =>
            feedsOf({ ...context, connection }, single(listed[i]), shown),
        );
        return 'ended' in outcome
          ? outcome.ended
          : listAnswer(listed, outcome.answers, levelOf(args));
      } catch (error) {
        if (failureOf(error) === undefined) throw error;
        return answerThrown(error, ctx);
      }
    },
    async () => {
      // One feed after another, each as the single call reads it; a
      // credential failure ends the call, and nothing after it is read.
      const results: McpResult[] = [];
      for (const feedType of listed) {
        const result = await feedsOf(context, single(feedType), shown);
        if (endsList(result)) return result;
        results.push(result);
      }
      return listAnswer(listed, results, levelOf(args));
    },
  );
}
