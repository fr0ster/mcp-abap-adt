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
 * - The outer status of the envelope request is seen by a forwarding
 *   connection placed under the `AdtBatchConnection`: it sees the response
 *   before the batch parses it (a connection that resolves a `404` without a
 *   multipart body makes the parser throw an error with no status) and the
 *   transport's rejection (an outer `404` rejected with `response`). That
 *   status — never the parser's error — goes to the destination's port
 *   (`HandlerContext.batchAvailability`). An outer `404` also ends the phase:
 *   its error is thrown, as it came, marked as the endpoint's absence.
 * - `withSequentialFallback` runs the sequential version when the destination
 *   is known to have no batch, or when an envelope of the batched version met
 *   the outer `404`; the batched version otherwise. Both versions only read,
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

/**
 * A forwarding connection over `connection` that keeps the status of each
 * request's own response — resolved, or carried by the rejection as its
 * `response` — before anyone reads the body. It sends through the
 * connection's base request, past any accept negotiation, and is itself
 * exempt from it.
 */
function outerStatusWatch(connection: IAbapConnection): {
  forwarding: IAbapConnection;
  outer(): number | undefined;
} {
  let outer: number | undefined;
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
      outer = undefined;
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
  return { forwarding, outer: () => outer };
}

/**
 * One phase: `read(item, batch)` for every item, recorded on one batch
 * connection over `context.connection` and sent in one envelope; each item's
 * settlement, in item order (see the file header). The envelope request's
 * outer status is reported to `context.batchAvailability`.
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
  const settled = items.map((item) =>
    (async () => read(item, batch))().then(
      (value): PhaseResult<R> => ({ ok: true, value }),
      (error: unknown): PhaseResult<R> => ({ ok: false, error }),
    ),
  );
  // Every read records its request before the envelope is sent: the same
  // turn adt-clients yields for follow-ups.
  await new Promise((resolve) => setImmediate(resolve));
  let failed = false;
  let error: unknown;
  try {
    await batch.execute();
  } catch (thrown) {
    failed = true;
    error = thrown;
  }
  const outer = watch.outer();
  if (outer !== undefined) context.batchAvailability?.noteOuterStatus(outer);
  if (failed && outer === NO_BATCH_ENDPOINT_STATUS) {
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
 * `batched` answered with the outer `404`; `batched` otherwise. Any other
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
