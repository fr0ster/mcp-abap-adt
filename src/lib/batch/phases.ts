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
 *   instance) ends the call: rethrown as it came, never a result. The batch
 *   connection is exempt from accept negotiation (adt-clients 34), and so is
 *   the forwarding connection under it: nothing is corrected or resent.
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
import {
  AdtBatchConnection,
  exemptFromAcceptNegotiation,
  getBaseRequest,
} from '@mcp-abap-adt/adt-clients';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../handlers/interfaces';
import { failureOf, readOwn } from '../auth/failures';
import { NO_BATCH_ENDPOINT_STATUS } from './availability';

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
 * phase's one envelope request through the connection's base request, past
 * any accept negotiation, and is itself exempt from it; it keeps that
 * request's outer status — resolved, or carried by the rejection as its
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
  const typed = connection as {
    getSessionType?: () => Session;
    getSessionMode?: () => Session;
  };
  const forwarding = {
    connect: () => connection.connect(),
    getBaseUrl: () => connection.getBaseUrl(),
    getSessionId: () => connection.getSessionId(),
    setSessionType: (type: Session) => connection.setSessionType(type),
    getSessionType: (): Session =>
      typed.getSessionType?.() ?? typed.getSessionMode?.() ?? 'stateless',
    makeAdtRequest<T = unknown, D = unknown>(
      request: IAbapRequestOptions,
    ): Promise<IAdtWireResponse<T, D>> {
      sent += 1;
      if (sent > 1) {
        refused ??= new Error(MORE_ENVELOPES_WORDS);
        return Promise.reject(refused);
      }
      return getBaseRequest(connection)<T, D>(request).then(
        (response) => {
          outer = statusOf(response);
          return response;
        },
        (error: unknown) => {
          outer = statusOf(readOwn(error, 'response'));
          throw error;
        },
      );
    },
  } satisfies IAbapConnection & { getSessionType(): Session };
  exemptFromAcceptNegotiation(forwarding);
  return { forwarding, outer: () => outer, refused: () => refused };
}

/**
 * One item's view of the phase's batch connection: every member forwards to
 * `batch`; its first request signals `recorded`. Once the phase's envelope
 * is under way (`sealed()`), a request is not recorded — it is rejected at
 * once with `LATE_RECORD_WORDS`, so it neither waits in a queue nobody sends
 * nor goes out in a second envelope. Exempt from accept negotiation, as the
 * batch connection is.
 */
function itemView(
  batch: AdtBatchConnection,
  sealed: () => boolean,
  recorded: () => void,
): IAbapConnection {
  const view = {
    connect: () => batch.connect(),
    getBaseUrl: () => batch.getBaseUrl(),
    getSessionId: () => batch.getSessionId(),
    setSessionType: (type: Session) => batch.setSessionType(type),
    getSessionType: (): Session => batch.getSessionType(),
    makeAdtRequest<T = unknown, D = unknown>(
      request: IAbapRequestOptions,
    ): Promise<IAdtWireResponse<T, D>> {
      if (sealed()) return Promise.reject(new Error(LATE_RECORD_WORDS));
      const answer = batch.makeAdtRequest<T, D>(request);
      recorded();
      return answer;
    },
  } satisfies IAbapConnection & { getSessionType(): Session };
  exemptFromAcceptNegotiation(view);
  return view;
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
export async function runPhase<I, R>(
  context: HandlerContext,
  items: readonly I[],
  read: (item: I, batch: IAbapConnection) => Promise<R>,
): Promise<PhaseResult<R>[]> {
  const watch = outerStatusWatch(context.connection);
  const batch = new AdtBatchConnection(watch.forwarding, {
    endpoint: 'communication',
    ...(context.logger !== undefined ? { logger: context.logger } : {}),
  });
  let sealed = false;
  const entries = items.map((item) => {
    let signal!: () => void;
    const recorded = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const view = itemView(batch, () => sealed, signal);
    const settled = (async () => read(item, view))().then(
      (value): PhaseResult<R> => ({ ok: true, value }),
      (error: unknown): PhaseResult<R> => ({ ok: false, error }),
    );
    return { recorded, settled };
  });
  // Every item has recorded or settled.
  await Promise.all(entries.map((e) => Promise.race([e.recorded, e.settled])));
  // The parts an item records in the same stretch as its first: every
  // pending continuation runs before the envelope is sealed.
  await new Promise((resolve) => setImmediate(resolve));
  sealed = true;
  let failed = false;
  let error: unknown;
  try {
    await batch.execute();
  } catch (thrown) {
    failed = true;
    error = thrown;
  }
  const settled = entries.map((e) => e.settled);
  const refused = watch.refused();
  if (refused !== undefined) {
    // Nothing of the phase is kept: every item fails with the fixed words.
    await Promise.all(settled);
    return items.map(() => ({ ok: false, error: refused }));
  }
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
    throw error;
  }
  const results = await Promise.all(settled);
  // A credential refusal reaches every part as the same object
  // (adt-clients): the call ends with it, as it came.
  for (const result of results) {
    if (!result.ok && failureOf(result.error) !== undefined) {
      throw result.error;
    }
  }
  return results;
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
