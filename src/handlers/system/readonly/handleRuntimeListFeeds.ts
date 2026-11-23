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
  answerThrown,
  failedPayloadOf,
  isCredentialPayload,
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
  type AnswerTable,
  answerAt,
  completeAnswer,
  identityOf,
  type ListedPart,
  listedText,
  Written,
  wireAnswer,
} from '../../../lib/detail';
import {
  DUMP_FILTERS,
  dumpFiltersRefusal,
  isOperand,
} from '../../../lib/dumpFilters';
import { withInCallSchema } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { type JsonValue, jsonOrText } from '../../../lib/json';
import {
  LONG_BACKGROUND_FIELD,
  withLongToolAdvice,
} from '../../../lib/longTools';
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

export const TOOL_DEFINITION = {
  name: 'RuntimeListFeeds',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] [runtime] Reads the ADT runtime feed named by feed_type: with feed_type "dumps", the ABAP short dumps (runtime errors) of the program or object named by object_name, of the user named by user, in the time range from–to, filtered also by runtime error, exception, package and application component; with "system_messages" or "gateway_errors", the system messages or SAP Gateway errors of the user and time range; with "descriptors" (the default) or "variants", the feeds and their variants. Entries come newest first; each dump carries its dump_id. When more entries remain, next_to is the `to` that reads on; incomplete_second names a second holding more entries than SAP answers in one request. Takes feed_type (one feed: its answer) or feed_types (several feeds with the same filters: one entry per feed, in the order given, each its answer or { feed_type, error }). By default (detail terse) TSV under "# feed" and "# count" lines, next_to and incomplete_second as "#" lines: descriptors id, title, category; variants feed, title, query, is_default; dumps dump_id, updated, title; system messages id, createdOn, author, title; gateway errors opid, detail_kind, dateTime, type, shortText, username. With detail medium or full every field as JSON.',
  ),
  inputSchema: withInCallSchema(
    z
      .object({ background: LONG_BACKGROUND_FIELD, ...FIELDS })
      .superRefine(oneFeedForm),
    z.object(FIELDS).superRefine(oneFeedForm),
  ),
} as const;

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
type FeedShown =
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

/** A feed's columns, the columns of an item's identity, and a row per item. */
function feedRows(shown: FeedShown): {
  columns: string[];
  identity: number[];
  rows: string[][];
} {
  switch (shown.feed) {
    case 'descriptors':
      return {
        columns: ['id', 'title', 'category'],
        identity: [0],
        rows: shown.answered.entries.map((e) => [
          e.id,
          e.title,
          e.category ?? '',
        ]),
      };
    case 'variants':
      return {
        columns: ['feed', 'title', 'query', 'is_default'],
        identity: [0, 1, 2],
        // Every feed: one without variants is a row with none.
        rows: shown.answered.entries.flatMap((feed) =>
          feed.variants.length === 0
            ? [[feed.feed, '', '', '']]
            : feed.variants.map((v) => [
                feed.feed,
                v.title,
                v.query,
                String(v.is_default),
              ]),
        ),
      };
    case 'dumps':
      return {
        columns: ['dump_id', 'updated', 'title'],
        identity: [0],
        rows: shown.answered.entries.map((e) => [
          e.dump_id,
          e.updated,
          e.title,
        ]),
      };
    case 'system_messages':
      return {
        columns: ['id', 'createdOn', 'author', 'title'],
        identity: [0],
        rows: shown.answered.entries.map((e) => [
          e.id ?? e.messageId ?? '',
          e.createdOn ?? '',
          e.author ?? e.createdBy ?? '',
          e.title ?? '',
        ]),
      };
    case 'gateway_errors':
      return {
        columns: [
          'opid',
          'detail_kind',
          'dateTime',
          'type',
          'shortText',
          'username',
        ],
        identity: [0],
        rows: shown.answered.entries.map((e) => [
          e.opid ?? '',
          detailKindOf(e),
          e.dateTime ?? '',
          e.type ?? '',
          e.shortText ?? '',
          e.username ?? '',
        ]),
      };
  }
}

/** Every item a feed holds, as its row identifies it: each entry, each variant, a feed without variants. */
function heldFeedItems(shown: FeedShown): string[] {
  switch (shown.feed) {
    case 'descriptors':
      return shown.answered.entries.map((e) => identityOf([e.id]));
    case 'variants':
      return shown.answered.entries.flatMap((feed) =>
        feed.variants.length === 0
          ? [identityOf([feed.feed, '', ''])]
          : feed.variants.map((v) => identityOf([feed.feed, v.title, v.query])),
      );
    case 'dumps':
      return shown.answered.entries.map((e) => identityOf([e.dump_id]));
    case 'system_messages':
      return shown.answered.entries.map((e) =>
        identityOf([e.id ?? e.messageId ?? '']),
      );
    case 'gateway_errors':
      return shown.answered.entries.map((e) => identityOf([e.opid ?? '']));
  }
}

/**
 * A feed's terse answer: TSV under its `# feed` and `# count` lines — every
 * item the feed holds, or nothing (`completeAnswer`).
 */
const terseFeed = completeAnswer(
  'RuntimeListFeeds',
  heldFeedItems,
  (shown: FeedShown) => terseFeedText(shown),
);

/** A feed's terse text: its `# feed`, `# count` and paging lines, then its rows. */
function terseFeedText(shown: FeedShown): Written<string> {
  const { columns, identity, rows } = feedRows(shown);
  const paged =
    shown.feed === 'descriptors' || shown.feed === 'variants'
      ? { next_to: undefined, incomplete_second: undefined }
      : shown.answered;
  return Written.text(
    [
      { head: 'feed', value: shown.feed },
      { head: 'count', value: String(shown.answered.count) },
      ...(paged.next_to ? [{ head: 'next_to', value: paged.next_to }] : []),
      ...(paged.incomplete_second
        ? [{ head: 'incomplete_second', value: paged.incomplete_second }]
        : []),
      { header: columns },
      ...rows.map((row) => ({ row })),
    ],
    identity,
  );
}

/**
 * What `RuntimeListFeeds` answers at each `detail`, selected by the handler
 * before the reads (`src/lib/detail`): terse a feed's rows as TSV, medium,
 * full and raw the former JSON, every field.
 */
const FEED_ANSWERS: AnswerTable<FeedShown, string | object> = {
  terse: terseFeed,
  medium: (shown) => shown.answered,
  full: (shown) => shown.answered,
  raw: (shown) => shown.answered,
};

/**
 * Each answered feed's read, by the answer it became: a list call writes
 * every feed's terse text from these through `Written`, never by splicing
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
  const atLevel = answerAt(FEED_ANSWERS, levelOf(args));
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
  return jsonOrText(result.content[0]?.text ?? '');
}

/** Whether an answer is a credential failure: it ends a call for several feeds. */
function endsList(result: McpResult): boolean {
  const failed = failedPayloadOf(result, 'read feed');
  return failed !== undefined && isCredentialPayload(failed);
}

/** A list call's answer: one entry per feed, in the order asked. */
function listAnswer(
  feedTypes: readonly string[],
  results: readonly McpResult[],
  terse: boolean,
): McpResult {
  if (terse) {
    // Every feed's text through `Written`: a failure under its escaped
    // `# feed` line and one `# error` line; an answered one as its own
    // terse writer writes it.
    const text = listedText(
      'RuntimeListFeeds',
      results.map((result, i): ListedPart<FeedShown> => {
        const read = readsOf.get(result);
        return result.isError || read === undefined
          ? {
              heads: [{ head: 'feed', value: feedTypes[i] ?? '' }],
              error: JSON.stringify(payloadOfAnswer(result)),
            }
          : { heads: [], read };
      }),
      heldFeedItems,
      terseFeedText,
    );
    return { isError: false, content: [{ type: 'text', text }] };
  }
  const entries = results.map((result, i) =>
    result.isError
      ? { feed_type: feedTypes[i], error: payloadOfAnswer(result) }
      : payloadOfAnswer(result),
  );
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(entries) }],
  };
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
  const shown = answerAt(FEED_ANSWERS, levelOf(args));
  const terse = levelOf(args) === 'terse';
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
          : listAnswer(listed, outcome.answers, terse);
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
      return listAnswer(listed, results, terse);
    },
  );
}
