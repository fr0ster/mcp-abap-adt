import { AdtRuntimeClient, FeedRepository } from '@mcp-abap-adt/adt-clients';
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
    '[read-only] [runtime] Reads the ADT runtime feed named by feed_type: with feed_type "dumps", the ABAP short dumps (runtime errors) of the program or object named by object_name, of the user named by user, in the time range from–to, filtered also by runtime error, exception, package and application component; with "system_messages" or "gateway_errors", the system messages or SAP Gateway errors of the user and time range; with "descriptors" (the default) or "variants", the feeds and their variants. Entries come newest first; each dump carries its dump_id. When more entries remain, next_to is the `to` that reads on; incomplete_second names a second holding more entries than SAP answers in one request. Takes feed_type (one feed: its answer) or feed_types (several feeds with the same filters: one entry per feed, in the order given, each its answer or { feed_type, error }).',
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
      },
      feed_types: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'descriptors',
            'variants',
            'dumps',
            'system_messages',
            'gateway_errors',
          ],
        },
        description:
          'Several feeds, read together with the same filters (give this or feed_type).',
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
  feed_types?: Array<NonNullable<RuntimeListFeedsArgs['feed_type']>>;
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

async function feedsOf(context: HandlerContext, args: RuntimeListFeedsArgs) {
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

/** A request a feed's read made, waiting for its round. */
interface Asked {
  request: IAbapRequestOptions;
  resolve: (response: IAdtWireResponse) => void;
  reject: (error: unknown) => void;
}

/** The fixed words of a request made once the rounds have ended. */
const ROUNDS_ENDED_WORDS =
  'the feeds read in envelopes have ended: no further request is sent';

/**
 * A connection for one feed's read whose requests wait for their round:
 * `ask` holds each one until the round sends it, and settles it with the
 * part's answer.
 */
function roundConnection(
  connection: HandlerContext['connection'],
  ask: (request: IAbapRequestOptions) => Promise<IAdtWireResponse>,
): HandlerContext['connection'] {
  const view = {
    connect: () => connection.connect(),
    getBaseUrl: () => connection.getBaseUrl(),
    getSessionId: () => connection.getSessionId(),
    // A feed's requests go in the round's envelope, a stateless read: the
    // feed sets no session type of its own.
    setSessionType: (_type: 'stateful' | 'stateless') => undefined,
    getSessionType: (): 'stateful' | 'stateless' => 'stateless',
    makeAdtRequest<T = unknown, D = unknown>(
      request: IAbapRequestOptions,
    ): Promise<IAdtWireResponse<T, D>> {
      return ask(request) as Promise<IAdtWireResponse<T, D>>;
    },
  };
  return view as HandlerContext['connection'];
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
  const states = Array.from({ length: count }, () => {
    let signal!: () => void;
    const asked = new Promise<void>((resolve) => {
      signal = resolve;
    });
    return { asked, signal, pending: undefined as Asked | undefined };
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
    const asking = states.filter((state) => state.pending !== undefined);
    if (asking.length === 0) break;
    const round = asking.map((state) => {
      const asked = state.pending as Asked;
      state.pending = undefined;
      state.asked = new Promise<void>((resolve) => {
        state.signal = resolve;
      });
      return asked;
    });
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
function payloadOfAnswer(result: McpResult): unknown {
  const text = result.content[0]?.text ?? '';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Whether an answer is a credential failure: it ends a call for several feeds. */
function endsList(result: McpResult): boolean {
  const failed = failedPayloadOf(result, 'read feed');
  return failed !== undefined && isCredentialPayload(failed);
}

/** A list call's answer: one entry per feed, in the order asked. */
function listAnswer(
  feedTypes: readonly unknown[],
  results: readonly McpResult[],
): McpResult {
  const entries = results.map((result, i) =>
    result.isError
      ? { feed_type: feedTypes[i], error: payloadOfAnswer(result) }
      : payloadOfAnswer(result),
  );
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(entries, null, 2) }],
  };
}

/** The feeds read page by page: more than one request a call. */
const PAGED_FEEDS = new Set(['dumps', 'system_messages', 'gateway_errors']);

/**
 * The runtime feeds, one or several: the paged feeds' requests in ADT batch
 * envelopes, one round at a time; the sequential reads where the
 * destination has no communication batch. One feed of one request (the
 * descriptors or the variants) is sent as itself.
 */
export async function handleRuntimeListFeeds(
  context: HandlerContext,
  args: RuntimeListFeedsArgs,
) {
  const ctx = { tool: 'RuntimeListFeeds', detail: 'terse' as const };
  const listed = args?.feed_types;
  if (listed === undefined) {
    if (!PAGED_FEEDS.has(String(args?.feed_type))) {
      return feedsOf(context, args);
    }
    return withSequentialFallback<McpResult>(
      context,
      async () => {
        try {
          const outcome = await feedsInRounds(
            context,
            1,
            (_i, connection) =>
              feedsOf({ ...context, connection }, args) as Promise<McpResult>,
          );
          return 'ended' in outcome
            ? outcome.ended
            : (outcome.answers[0] as McpResult);
        } catch (error) {
          // A refusal the connection threw: as `answer()` renders a throw of
          // the sequential version's call.
          if (failureOf(error) === undefined) throw error;
          return answerThrown(error, ctx);
        }
      },
      () => feedsOf(context, args) as Promise<McpResult>,
    );
  }
  if (
    args.feed_type !== undefined ||
    !Array.isArray(listed) ||
    listed.length === 0
  ) {
    return return_error(
      new Error(
        'Give exactly one of feed_type or feed_types (a non-empty list of feed types).',
      ),
    );
  }
  const { feed_types: _list, ...rest } = args;
  const single = (feedType: unknown): RuntimeListFeedsArgs => ({
    ...rest,
    feed_type: feedType as RuntimeListFeedsArgs['feed_type'],
  });
  return withSequentialFallback<McpResult>(
    context,
    async () => {
      try {
        const outcome = await feedsInRounds(
          context,
          listed.length,
          (i, connection) =>
            feedsOf(
              { ...context, connection },
              single(listed[i]),
            ) as Promise<McpResult>,
        );
        return 'ended' in outcome
          ? outcome.ended
          : listAnswer(listed, outcome.answers);
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
        const result = (await feedsOf(context, single(feedType))) as McpResult;
        if (endsList(result)) return result;
        results.push(result);
      }
      return listAnswer(listed, results);
    },
  );
}
