/**
 * Internal batches (spec §11): a handler that reads several independent things
 * sends them in one ADT batch envelope, phase by phase, and falls back to its
 * sequential reads where the destination has no communication batch.
 *
 * - `runPhase` records `read(item, batch)` for every item on one
 *   `AdtBatchConnection` (`endpoint: 'communication'`) over the call's
 *   connection, sends it with one `execute()`, and answers each item's
 *   settlement in item order. Every request of a phase is independent of the
 *   others: a request that needs another's answer goes in a later phase.
 *   A part's non-2xx is that item's failure; an envelope that fails is every
 *   item's failure, the envelope's error as it came; a credential refusal (or
 *   another failure the server's reader answers — its own refusal, a closed
 *   instance) ends the call: rethrown as it came, never a result.
 * - The format correction, the phase's own (`correctPhaseParts`): a part
 *   recorded by a header-taking call (`withAdtHeaders`) goes in with the
 *   system's kept pair, else the operation's default. Right after the
 *   envelope answered, before any answer reaches its read, the parts SAP
 *   answered `406`/`415` go in one envelope of their own — only those parts,
 *   each recorded again by the same member call with the corrected pair
 *   (`correctedPair`), kept for the system. One round: what the correction
 *   envelope answers is the call's answer, whatever it is. A `406`/`415`
 *   naming nothing, or naming what the part sent, is the part's answer; so
 *   is a part no header-taking call recorded.
 * - Each item records through its own view of the batch connection, which
 *   signals its first request; the envelope is sent once every item has
 *   recorded or settled without recording. A request recorded once the
 *   envelope is under way is rejected at once (`LATE_RECORD_WORDS`), and a
 *   phase that would need a second envelope fails every item
 *   (`MORE_ENVELOPES_WORDS`): one phase, one envelope.
 * - The outer status of the envelope request is seen by a forwarding
 *   connection placed under the `AdtBatchConnection`: it sees the response
 *   before the batch parses it (a connection that resolves a `404` without a
 *   multipart body makes the parser throw an error with no status) and the
 *   transport's rejection (an outer `404` rejected with `response`). That
 *   status — never the parser's error — goes to the destination's port
 *   (`HandlerContext.batchAvailability`), whose first verdict decides. An
 *   outer `404` that is the verdict (the destination's first, or the call's
 *   own where it has no record) ends the phase: its error is thrown, as it
 *   came, marked as the endpoint's absence. After a served verdict an outer
 *   `404` is that phase's envelope failure, every item's.
 * - `withSequentialFallback` runs the sequential version when the destination
 *   is known to have no batch, or when an envelope of the batched version met
 *   the outer `404` that decided it; the batched version otherwise. Both versions only read,
 *   so a fallback changes nothing on the system.
 *
 * No timer and no retry: the phase waits for its envelope as long as SAP
 * takes; the long call's own `timeout`, when given, cuts it by logging its
 * connection off.
 */

import { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import type { IAdtHeaders } from '@mcp-abap-adt/interfaces-adt';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../handlers/interfaces';
import { adtCallScope, type HeaderInvocation } from '../adtHeaders/scope';
import { correctedPair } from '../adtHeaders/withAdtHeaders';
import { appendAll } from '../appendAll';
import { failureOf, readOwn } from '../auth/failures';
import {
  MIN_PARTS_PER_ENVELOPE,
  partsPerEnvelopeRefusal,
} from '../config/authParameters';
import { withSystemKindOf } from '../connectionFactory';
import { NO_BATCH_ENDPOINT_STATUS } from './availability';

/**
 * `value` when it is a bound the envelopes can keep — a whole number from
 * `MIN_PARTS_PER_ENVELOPE` —, else a throw naming `name`. For a bound an
 * embedder states in its options (`partsPerEnvelope`); the configured one
 * is read by `BATCH_PARTS_PER_ENVELOPE_ROW`.
 */
export function partsPerEnvelopeOf(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < MIN_PARTS_PER_ENVELOPE) {
    throw new Error(partsPerEnvelopeRefusal(name));
  }
  return value;
}

/**
 * The consecutive slices of `items`, in order. `size` absent: no bound,
 * every item in one slice (none for no item) — whatever SAP answers to it
 * is SAP's. `size` given (the consumer's bound): as few slices as hold at
 * most `size` each, balanced — their lengths differ by one at most, so past
 * the bound no slice is a single read beside a full one (301 reads at 300
 * are 151 and 150, never 300 and 1).
 */
export function chunksOf<I>(
  items: readonly I[],
  size: number | undefined,
): I[][] {
  if (items.length === 0) return [];
  const count = size === undefined ? 1 : Math.ceil(items.length / size);
  const chunks: I[][] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    // The first `items.length % count` slices take one more.
    const length =
      Math.floor(items.length / count) + (i < items.length % count ? 1 : 0);
    chunks.push(items.slice(at, at + length));
    at += length;
  }
  return chunks;
}

/** The fixed words of a read that needs more parts than the consumer's bound: both numbers. */
export function oversizedReadWords(parts: number, bound: number): string {
  return `a read of this step needs ${parts} parts in one ADT batch envelope, more than the ${bound} parts per envelope set (--batch-parts-per-envelope / partsPerEnvelope); nothing was sent`;
}

/**
 * The items in consecutive envelopes of at most `bound` parts, each item's
 * `parts` together in one, in item order: as few envelopes as a greedy fill
 * needs, balanced when that takes no more envelopes (302 one-part reads at
 * 300 are 151 and 151). An item over the bound goes alone in its envelope,
 * which the dispatch check then refuses (`checkedEnvelopes`).
 */
export function packByParts<I>(
  items: readonly I[],
  parts: readonly number[],
  bound: number,
): I[][] {
  const fill = (cap: number): I[][] => {
    const out: I[][] = [];
    let current: I[] = [];
    let used = 0;
    items.forEach((item, at) => {
      const own = parts[at] ?? 0;
      if (current.length > 0 && used + own > cap) {
        out.push(current);
        current = [];
        used = 0;
      }
      current.push(item);
      used += own;
    });
    if (current.length > 0) out.push(current);
    return out;
  };
  const greedy = fill(bound);
  if (greedy.length < 2) return greedy;
  let total = 0;
  let largest = 0;
  for (const own of parts) {
    total += own;
    if (own > largest) largest = own;
  }
  const balanced = fill(Math.max(largest, Math.ceil(total / greedy.length)));
  return balanced.length <= greedy.length ? balanced : greedy;
}

/** One item's settlement in a phase. */
export type PhaseResult<R> =
  | { ok: true; value: R }
  | { ok: false; error: unknown };

type Session = 'stateful' | 'stateless';

/** The errors an envelope met with an outer `404`: the endpoint is not served. */
const noBatchEndpoint = new WeakSet<object>();

/** Whether `error` is the failure of an envelope answered with the outer `404`. */
function isNoBatchEndpoint(error: unknown): boolean {
  return (
    error !== null &&
    (typeof error === 'object' || typeof error === 'function') &&
    noBatchEndpoint.has(error)
  );
}

/** An integer status read as an own data property; `undefined` otherwise. */
function statusOf(response: unknown): number | undefined {
  const status = readOwn(response, 'status');
  return typeof status === 'number' && Number.isInteger(status)
    ? status
    : undefined;
}

/** The fixed words of a request a phase's read records after its envelope was sent. */
export const LATE_RECORD_WORDS =
  "an internal batch phase's read recorded a request after the phase's envelope was sent: a request that needs another's answer belongs in a later phase";

/** The fixed words of a phase whose requests would need more than one envelope. */
export const MORE_ENVELOPES_WORDS =
  'an internal batch phase would send more than one envelope: every request of a phase is a stateless read sent in one envelope';

/**
 * A forwarding connection over `connection` for one phase. It sends the
 * phase's one envelope request through the connection's `makeAdtRequest`;
 * it keeps that request's outer status — resolved, or carried by the rejection as its
 * `response` — before anyone reads the body. A second envelope request is
 * not sent: it is refused with `MORE_ENVELOPES_WORDS`, and the phase fails.
 */
function outerStatusWatch(connection: IAbapConnection): {
  forwarding: IAbapConnection;
  outer(): number | undefined;
  refused(): Error | undefined;
} {
  let outer: number | undefined;
  let sent = 0;
  let refused: Error | undefined;
  const forwarding = {
    connect: () => connection.connect(),
    getBaseUrl: () => connection.getBaseUrl(),
    getSessionId: () => connection.getSessionId(),
    setSessionType: (type: Session) => connection.setSessionType(type),
    getSessionType: (): Session =>
      connection.getSessionType?.() ??
      connection.getSessionMode?.() ??
      'stateless',
    makeAdtRequest(request: IAbapRequestOptions): Promise<IAdtWireResponse> {
      sent += 1;
      if (sent > 1) {
        refused ??= new Error(MORE_ENVELOPES_WORDS);
        return Promise.reject(refused);
      }
      return connection.makeAdtRequest(request).then(
        (response) => {
          outer = Number.isInteger(response.status)
            ? response.status
            : undefined;
          return response;
        },
        (error: unknown) => {
          outer = statusOf(readOwn(error, 'response'));
          throw error;
        },
      );
    },
  } satisfies IAbapConnection & { getSessionType(): Session };
  return {
    forwarding: withSystemKindOf(forwarding, connection),
    outer: () => outer,
    refused: () => refused,
  };
}

/**
 * One item's view of the phase's batch connection: every member forwards to
 * `batch`; its first request signals `recorded`. Once the phase's envelope
 * is under way (`sealed()`), a request is not recorded — it is rejected at
 * once with `LATE_RECORD_WORDS`, so it neither waits in a queue nobody sends
 * nor goes out in a second envelope. A request of a call the phase records
 * again (`correctPhaseParts`) goes to the correction envelope.
 */
function itemView(
  batch: AdtBatchConnection,
  sealed: () => boolean,
  recorded: () => void,
  record: (request: IAbapRequestOptions) => Promise<IAdtWireResponse>,
): IAbapConnection {
  const view = {
    connect: () => batch.connect(),
    getBaseUrl: () => batch.getBaseUrl(),
    getSessionId: () => batch.getSessionId(),
    setSessionType: (type: Session) => batch.setSessionType(type),
    getSessionType: (): Session => batch.getSessionType(),
    makeAdtRequest(request: IAbapRequestOptions): Promise<IAdtWireResponse> {
      const correcting = adtCallScope.getStore()?.correcting;
      if (correcting !== undefined && correcting.phase === batch) {
        return correcting.record(request);
      }
      if (sealed()) return Promise.reject(new Error(LATE_RECORD_WORDS));
      const answer = record(request);
      recorded();
      return answer;
    },
  } satisfies IAbapConnection & { getSessionType(): Session };
  return withSystemKindOf(view, batch);
}

/** A part's answer: SAP's response, or the failure it was rejected with. */
type PartAnswer =
  | { ok: true; response: IAdtWireResponse }
  | { ok: false; error: unknown };

/** One recorded part: its first answer, its hand-over, and the call that recorded it. */
interface RecordedPart {
  first: Promise<PartAnswer>;
  answer(final: PartAnswer): void;
  /** The header-taking call that recorded it, when one did. */
  invocation: HeaderInvocation | undefined;
}

/** Settles as `answer`, never rejecting. */
function settledOf(answer: Promise<IAdtWireResponse>): Promise<PartAnswer> {
  return answer.then(
    (response): PartAnswer => ({ ok: true, response }),
    (error: unknown): PartAnswer => ({ ok: false, error }),
  );
}

/**
 * The format correction of a phase whose envelope answered: every call one
 * of whose parts SAP answered `406`/`415` naming what its pair did not send
 * is recorded again — the same member call, with the corrected pair (kept
 * for the system) — in one envelope of its own; that call's answer there is
 * its answer (`HeaderInvocation.redo`). One round; nothing else is sent.
 */
async function correctPhaseParts(
  context: HandlerContext,
  phase: object,
  parts: readonly RecordedPart[],
  firsts: readonly PartAnswer[],
): Promise<{ failed?: { error: unknown }; answers: readonly PartAnswer[] }> {
  const corrected: { invocation: HeaderInvocation; pair: IAdtHeaders }[] = [];
  const seen = new Set<HeaderInvocation>();
  firsts.forEach((first, at) => {
    const invocation = parts[at]?.invocation;
    if (invocation === undefined || first.ok || seen.has(invocation)) return;
    const pair = correctedPair(first.error, invocation.sent);
    if (pair === undefined) return;
    seen.add(invocation);
    corrected.push({ invocation, pair });
  });
  if (corrected.length === 0) return { answers: [] };
  const watch = outerStatusWatch(context.connection);
  const batch = withSystemKindOf(
    new AdtBatchConnection(watch.forwarding, {
      endpoint: 'communication',
      ...(context.logger !== undefined ? { logger: context.logger } : {}),
    }),
    watch.forwarding,
  );
  // The corrected parts' answers, for the phase's decision to go on.
  const answers: Promise<PartAnswer>[] = [];
  const waits = corrected.map(({ invocation, pair }) => {
    invocation.port?.remember(invocation.operation, pair);
    let signal: () => void = () => {};
    const recorded = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const redone = adtCallScope.run(
      {
        correcting: {
          phase,
          record: (request) => {
            const answer = batch.makeAdtRequest(request);
            answers.push(settledOf(answer));
            signal();
            return answer;
          },
        },
      },
      () => invocation.redo(pair),
    );
    // The call reads its own answer (`withAdtHeaders`); the phase waits for
    // it to be recorded, or to settle.
    return Promise.race([recorded, redone]);
  });
  await Promise.all(waits);
  await new Promise((resolve) => setImmediate(resolve));
  try {
    await batch.execute();
  } catch (error) {
    // Every part recorded again settles with the envelope's failure: its
    // call's answer. The phase is told, so no later envelope is sent.
    return { failed: { error }, answers: await Promise.all(answers) };
  }
  return { answers: await Promise.all(answers) };
}

/**
 * What ends a phase after one of its envelopes, besides the envelope's own
 * failure: a failed correction envelope, or a part SAP answered `401` — the
 * credential's refusal, which ends the call whatever its read makes of it.
 * The error the items not sent settle with.
 */
type PhaseEnd = { readonly error: unknown } | undefined;

/** A part SAP answered `401`, as its first answer carries it. */
function unauthorizedPart(firsts: readonly PartAnswer[]): PhaseEnd {
  for (const first of firsts) {
    if (first.ok) continue;
    if (statusOf(readOwn(first.error, 'response')) === 401) {
      return { error: first.error };
    }
  }
  return undefined;
}

/**
 * One phase: `read(item, batch)` for every item, recorded on one batch
 * connection over `context.connection` and sent in one envelope; each item's
 * settlement, in item order (see the file header). The envelope request's
 * outer status is reported to `context.batchAvailability`.
 *
 * The envelope is sent once every item has recorded its first request or
 * settled without one — however long a read waits before it records (I/O,
 * a lookup elsewhere): no turn count, no timer. An item's independent parts
 * are recorded together with its first (before the read awaits anything
 * else); a request recorded after that is refused (`LATE_RECORD_WORDS`).
 */
/**
 * A phase's settlements, and whether its envelope failed (`batch.execute()`
 * rejected, or the phase was refused): the parts of a failed envelope are
 * answers adt-clients built from the envelope's rejection, so a caller that
 * must tell the two apart reads `envelope` first. The outer `404` that is
 * the endpoint's absence is thrown, as `runPhase` throws it.
 */
export interface PhaseOutcome<R> {
  results: PhaseResult<R>[];
  /**
   * `outer`: the envelope request's own status, when it had one — a `404`
   * there is the envelope's failure, not each part's "not found".
   */
  envelope:
    | { failed: false }
    | {
        failed: true;
        error: unknown;
        outer: number | undefined;
        /**
         * The first item of the envelope that failed: the items before it
         * were answered by envelopes that did not (absent: the first item).
         */
        from?: number;
      };
}

/**
 * How a phase decides to go on after each envelope, beside the rule that a
 * credential refusal always ends it.
 */
export interface PhaseRules<I, R> {
  /**
   * Whether a failed envelope — its own request, its correction envelope —
   * or a part SAP answered `401` ends the phase. Default `true`; `false` for
   * a phase whose every failure is the item's own (`GetObjectInfo`'s
   * metadata phase).
   */
  readonly failuresEnd?: boolean;
  /**
   * Asked after each envelope but the last, with its items and their
   * settlements, in item order: `true` ends the phase — the later envelopes
   * are not sent, and their reads settle with `NOT_SENT_WORDS`.
   */
  readonly after?: (
    items: readonly I[],
    results: readonly PhaseResult<R>[],
  ) => boolean | Promise<boolean>;
}

/** The fixed words a read settles with when its envelope was not sent: the phase ended before it. */
export const NOT_SENT_WORDS =
  "the step ended before this read's envelope was sent";

/** The errors the reads of an envelope not sent settle with (`NOT_SENT_WORDS`). */
const notSent = new WeakSet<Error>();

/** Whether `error` is a read's settlement for an envelope that was not sent. */
export function isNotSent(error: unknown): boolean {
  return error instanceof Error && notSent.has(error);
}

export async function runPhase<I, R>(
  context: HandlerContext,
  items: readonly I[],
  read: (item: I, batch: IAbapConnection) => Promise<R>,
  rules?: PhaseRules<I, R>,
): Promise<PhaseResult<R>[]> {
  const { results } = await runPhaseOutcome(context, items, read, rules);
  // A credential refusal reaches every part as the same object
  // (adt-clients): the call ends with it, as it came.
  for (const result of results) {
    if (!result.ok && failureOf(result.error) !== undefined) {
      throw result.error;
    }
  }
  return results;
}

/** One request a read recorded, waiting for its envelope. */
interface Pending extends RecordedPart {
  readonly item: number;
  readonly request: IAbapRequestOptions;
}

/**
 * The planned envelopes, each a run of item indexes, checked against the
 * bound by the parts recorded — right before anything is sent: an envelope
 * over the bound (a read needing more parts than the bound) is refused with
 * both numbers, and nothing of the phase goes out.
 */
function checkedEnvelopes(
  planned: readonly (readonly number[])[],
  partsOf: readonly number[],
  bound: number | undefined,
): { envelopes: readonly (readonly number[])[] } | { refused: Error } {
  if (bound === undefined) return { envelopes: planned };
  for (const envelope of planned) {
    let parts = 0;
    for (const item of envelope) parts += partsOf[item] ?? 0;
    if (parts > bound) {
      return { refused: new Error(oversizedReadWords(parts, bound)) };
    }
  }
  return { envelopes: planned };
}

/**
 * `runPhase`, its envelope's failure reported beside the settlements
 * (`PhaseOutcome`). Every read records its requests once, on a connection
 * that sends nothing; the recorded parts are then planned by the
 * consumer's bound (`context.partsPerEnvelope`): absent, one envelope; given,
 * balanced envelopes of at most that many parts, each read's parts together
 * (`packByParts`), checked before the first is sent (`checkedEnvelopes`).
 * The envelopes go one after another, each read handed its answers. An
 * envelope that met a credential refusal — and, unless `rules.failuresEnd`
 * is `false`, one that failed, whose correction envelope failed or that
 * holds a part SAP answered `401` — ends the phase, as `rules.after` may:
 * no later envelope is sent, and its reads settle with that failure (or
 * `NOT_SENT_WORDS`). The settlements stay one per item, in item order; the
 * outcome's `envelope` is the first failed envelope's.
 */
export async function runPhaseOutcome<I, R>(
  context: HandlerContext,
  items: readonly I[],
  read: (item: I, batch: IAbapConnection) => Promise<R>,
  rules?: PhaseRules<I, R>,
): Promise<PhaseOutcome<R>> {
  const failuresEnd = rules?.failuresEnd !== false;
  // The connection the reads record on: nothing is sent through it.
  const planning = withSystemKindOf(
    new AdtBatchConnection(context.connection, {
      endpoint: 'communication',
      ...(context.logger !== undefined ? { logger: context.logger } : {}),
    }),
    context.connection,
  );
  let sealed = false;
  const pending: Pending[] = [];
  const entries = items.map((item, at) => {
    let signal: () => void = () => {};
    const recorded = new Promise<void>((resolve) => {
      signal = resolve;
    });
    // A part's answer reaches its read once its envelope (and correction)
    // answered.
    const record = (
      request: IAbapRequestOptions,
    ): Promise<IAdtWireResponse> => {
      const invocation = adtCallScope.getStore()?.invocation;
      if (invocation !== undefined) invocation.parts += 1;
      let answer: (final: PartAnswer) => void = () => {};
      const final = new Promise<PartAnswer>((resolve) => {
        answer = resolve;
      });
      // `first` is set when the part is dispatched.
      pending.push({
        item: at,
        request,
        first: final,
        answer,
        invocation,
      });
      return final.then((settled) =>
        settled.ok ? settled.response : Promise.reject(settled.error),
      );
    };
    const view = itemView(planning, () => sealed, signal, record);
    const outer = adtCallScope.getStore();
    const settled = adtCallScope
      .run({ ...outer, phase: planning, invocation: undefined }, async () =>
        read(item, view),
      )
      .then(
        (value): PhaseResult<R> => ({ ok: true, value }),
        (error: unknown): PhaseResult<R> => ({ ok: false, error }),
      );
    return { recorded, settled };
  });
  // Every item has recorded or settled.
  await Promise.all(entries.map((e) => Promise.race([e.recorded, e.settled])));
  // The parts an item records in the same stretch as its first: every
  // pending continuation runs before the recording is sealed.
  await new Promise((resolve) => setImmediate(resolve));
  sealed = true;

  const partsOf = items.map(() => 0);
  for (const part of pending)
    partsOf[part.item] = (partsOf[part.item] ?? 0) + 1;
  const indexes = items.map((_, at) => at);
  const bound = context.partsPerEnvelope;
  const planned =
    items.length === 0
      ? []
      : bound === undefined
        ? [indexes]
        : packByParts(indexes, partsOf, bound);
  const checked = checkedEnvelopes(planned, partsOf, bound);
  const settleUnsent = (parts: readonly Pending[], error: unknown): void => {
    for (const part of parts) part.answer({ ok: false, error });
  };
  if ('refused' in checked) {
    // Nothing is sent: every read settles with the refusal, which is thrown.
    settleUnsent(pending, checked.refused);
    await Promise.all(entries.map((e) => e.settled));
    throw checked.refused;
  }

  let envelope: PhaseOutcome<R>['envelope'] = { failed: false };
  let ended: { error: unknown } | undefined;
  // Items of an envelope the phase was refused: nothing of theirs is kept.
  const refusedItems = new Map<number, Error>();
  for (const [at, run] of checked.envelopes.entries()) {
    const members = new Set(run);
    const parts = pending.filter((part) => members.has(part.item));
    if (ended !== undefined) {
      settleUnsent(parts, ended.error);
      continue;
    }
    const sent = await sendEnvelope(context, planning, parts);
    if (sent.absent !== undefined) {
      // The destination has no communication batch: nothing else is sent.
      settleUnsent(
        pending.filter((part) => !members.has(part.item)),
        sent.absent,
      );
      await Promise.all(entries.map((e) => e.settled));
      throw sent.absent;
    }
    const results = await Promise.all(
      run.map(
        (item): Promise<PhaseResult<R>> =>
          entries[item]?.settled ??
          Promise.resolve({ ok: false, error: sent.failed?.error }),
      ),
    );
    if (sent.failed !== undefined && !envelope.failed) {
      envelope = {
        failed: true,
        error: sent.failed.error,
        outer: sent.failed.outer,
        from: run[0] ?? 0,
      };
    }
    const refusal = results.find(
      (result) => !result.ok && failureOf(result.error) !== undefined,
    );
    if (sent.refused !== undefined) {
      // Nothing of the envelope is kept: every item fails with the fixed
      // words, and the phase ends.
      const refused = sent.refused;
      for (const item of run) refusedItems.set(item, refused);
      if (!envelope.failed) {
        envelope = { failed: true, error: refused, outer: undefined };
      }
      ended = { error: refused };
    } else if (refusal !== undefined && !refusal.ok) {
      ended = { error: refusal.error };
    } else if (failuresEnd && sent.failed !== undefined) {
      ended = { error: sent.failed.error };
    } else if (failuresEnd && sent.end !== undefined) {
      ended = sent.end;
    } else if (
      at < checked.envelopes.length - 1 &&
      rules?.after !== undefined &&
      (await rules.after(
        run.flatMap((item) => {
          const value = items[item];
          return value === undefined ? [] : [value];
        }),
        results,
      ))
    ) {
      const unsent = new Error(NOT_SENT_WORDS);
      notSent.add(unsent);
      ended = { error: unsent };
    }
  }
  const settled = await Promise.all(entries.map((e) => e.settled));
  const results = settled.map((result, at): PhaseResult<R> => {
    const refused = refusedItems.get(at);
    return refused === undefined ? result : { ok: false, error: refused };
  });
  return { results, envelope };
}

/** What one envelope's dispatch came to. */
interface SentEnvelope {
  /** The envelope request failed: every part's failure, as it came. */
  readonly failed?: { error: unknown; outer: number | undefined };
  /** The phase was refused a second envelope request (`MORE_ENVELOPES_WORDS`). */
  readonly refused?: Error;
  /** A part SAP answered `401`, or a failed correction envelope. */
  readonly end?: { error: unknown };
  /** The outer `404` that is the endpoint's absence: thrown by the phase. */
  readonly absent?: unknown;
}

/**
 * One envelope: `parts` recorded on a batch connection of its own, sent
 * once, their 406/415 parts corrected (not in a call recorded in batch
 * mode), and every part handed its answer. The envelope request's outer
 * status is reported to `context.batchAvailability`.
 */
async function sendEnvelope(
  context: HandlerContext,
  phase: object,
  parts: readonly Pending[],
): Promise<SentEnvelope> {
  const watch = outerStatusWatch(context.connection);
  const batch = withSystemKindOf(
    new AdtBatchConnection(watch.forwarding, {
      endpoint: 'communication',
      ...(context.logger !== undefined ? { logger: context.logger } : {}),
    }),
    watch.forwarding,
  );
  const dispatched = parts.map((part) => ({
    ...part,
    first: settledOf(batch.makeAdtRequest(part.request)),
  }));
  let failed = false;
  let error: unknown;
  try {
    await batch.execute();
  } catch (thrown) {
    failed = true;
    error = thrown;
  }
  // Every part has its first answer once the envelope settled. An envelope
  // that answered: its 406/415 parts are corrected before any answer is
  // handed on — not in a call recorded in batch mode, made once.
  const firsts = await Promise.all(dispatched.map((part) => part.first));
  let end: { error: unknown } | undefined = unauthorizedPart(firsts);
  if (!failed && adtCallScope.getStore()?.recorded !== true) {
    const correction = await correctPhaseParts(
      context,
      phase,
      dispatched,
      firsts,
    );
    end ??= correction.failed ?? unauthorizedPart(correction.answers);
  }
  dispatched.forEach((part, at) => {
    const first = firsts[at];
    if (first !== undefined) part.answer(first);
  });
  const refused = watch.refused();
  if (refused !== undefined) return { refused };
  const outer = watch.outer();
  const port = context.batchAvailability;
  if (outer !== undefined) port?.noteOuterStatus(outer);
  // An outer 404 is the endpoint's absence only when it is the verdict: the
  // destination's first, or the call's own where it has no record. After a
  // served verdict it is this phase's envelope failure.
  if (
    failed &&
    outer === NO_BATCH_ENDPOINT_STATUS &&
    (port === undefined || !port.available())
  ) {
    if (
      error !== null &&
      (typeof error === 'object' || typeof error === 'function')
    ) {
      noBatchEndpoint.add(error);
    }
    return { absent: error };
  }
  return {
    ...(failed && { failed: { error, outer } }),
    ...(end !== undefined && { end }),
  };
}

/**
 * `runPhaseOutcome`, or — with `alone`, by default when there is only one
 * item — each item read as single requests on the call's connection, one
 * after another, rather than an envelope of one part (an implementation
 * choice; the envelope would be as correct). The settlements in item
 * order; no envelope, so none
 * failed.
 */
export async function runPhaseOrAlone<I, R>(
  context: HandlerContext,
  items: readonly I[],
  read: (item: I, connection: IAbapConnection) => Promise<R>,
  alone = items.length < 2,
  rules?: PhaseRules<I, R>,
): Promise<PhaseOutcome<R>> {
  if (!alone) return runPhaseOutcome(context, items, read, rules);
  const results: PhaseResult<R>[] = [];
  for (const item of items) {
    results.push(
      await read(item, context.connection).then(
        (value): PhaseResult<R> => ({ ok: true, value }),
        (error: unknown): PhaseResult<R> => ({ ok: false, error }),
      ),
    );
  }
  return { results, envelope: { failed: false } };
}

/**
 * `sequential` where the destination has no communication batch — known
 * (`context.batchAvailability`), or learned now from an envelope of
 * `batched` answered with the outer `404` that is the verdict; `batched` otherwise. Any other
 * failure of `batched` is its own, as it came.
 */
export async function withSequentialFallback<R>(
  context: HandlerContext,
  batched: () => Promise<R>,
  sequential: () => Promise<R>,
): Promise<R> {
  if (context.batchAvailability?.available() === false) return sequential();
  try {
    return await batched();
  } catch (error) {
    if (isNoBatchEndpoint(error)) return sequential();
    throw error;
  }
}
