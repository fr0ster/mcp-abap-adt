/**
 * The per-call recorder: the connection a recorded call's handler is given
 * in batch mode, over the open batch's `AdtBatchConnection`.
 *
 * Every member forwards to the batch connection, so a request is recorded,
 * never sent: its promise settles only when `BatchEnd` executes the batch.
 * At the call's first `makeAdtRequest` the recorder takes the batch's next
 * number for the call and keeps it for every further request of the call —
 * a call may put several independent parts into the envelope (a source and
 * its metadata), all under its one number. A call that records nothing takes
 * no number.
 *
 * The recorder is an object of its own, not the batch connection, so it is
 * marked exempt from accept negotiation at creation: an `AdtClient` built
 * over it never corrects and resends what SAP answers to a recorded request
 * (a `406`/`415` part is that call's answer).
 */
import {
  type AdtBatchConnection,
  exemptFromAcceptNegotiation,
} from '@mcp-abap-adt/adt-clients';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { InstanceBatch, RawPart } from './InstanceBatch';

type Session = 'stateful' | 'stateless';

export interface Recorder extends IAbapConnection {
  getSessionType(): Session;
  /** The call's number: taken at its first request; `undefined` before. */
  number(): number | undefined;
  /** How many requests the call has recorded. */
  requests(): number;
  /** Calls `listener` after each request the call records. */
  onRequest(listener: () => void): void;
  /**
   * SAP's raw parts of the call's requests as they came, in the order sent —
   * kept only when the owner keeps raw parts (`keepRawParts`); a request not
   * answered (not sent, its envelope failed with no answer) has none.
   */
  rawParts(): RawPart[];
}

/** The raw part of a settled request: the inner response, or a failure's `response`. */
function rawOf(response: unknown): RawPart | undefined {
  if (response === null || typeof response !== 'object') return undefined;
  const r = response as {
    status?: unknown;
    statusText?: unknown;
    headers?: unknown;
    data?: unknown;
  };
  if (typeof r.status !== 'number') return undefined;
  const headers: Record<string, string> = {};
  if (r.headers !== null && typeof r.headers === 'object') {
    for (const [name, value] of Object.entries(r.headers)) {
      if (value === undefined || value === null) continue;
      headers[name] = Array.isArray(value) ? value.join(', ') : String(value);
    }
  }
  const data = r.data;
  const body =
    data === undefined || data === null
      ? ''
      : typeof data === 'string'
        ? data
        : JSON.stringify(data);
  return {
    status: r.status,
    status_text: typeof r.statusText === 'string' ? r.statusText : '',
    headers,
    body,
  };
}

/**
 * A recorder over `batch` for one call of `owner`'s open batch. `onRecorded`
 * is called once, with the call's number, at its first request.
 */
export function createRecorder(
  batch: AdtBatchConnection,
  owner: InstanceBatch,
  onRecorded: (n: number) => void,
): Recorder {
  let taken: number | undefined;
  let count = 0;
  const listeners: Array<() => void> = [];
  const raw: Array<RawPart | undefined> = [];
  const recorder: Recorder = {
    connect: () => batch.connect(),
    getBaseUrl: () => batch.getBaseUrl(),
    getSessionId: () => batch.getSessionId(),
    setSessionType: (type) => batch.setSessionType(type),
    getSessionType: () => batch.getSessionType(),
    makeAdtRequest<T = unknown, D = unknown>(
      request: IAbapRequestOptions,
    ): Promise<IAdtWireResponse<T, D>> {
      if (taken === undefined) {
        taken = owner.nextNumber();
        onRecorded(taken);
      }
      const recorded = batch.makeAdtRequest<T, D>(request);
      count += 1;
      if (owner.keepRawParts) {
        const index = raw.length;
        raw.push(undefined);
        recorded.then(
          (response) => {
            raw[index] = rawOf(response);
          },
          (error: unknown) => {
            raw[index] = rawOf(
              error !== null && typeof error === 'object'
                ? (error as { response?: unknown }).response
                : undefined,
            );
          },
        );
      }
      for (const listener of [...listeners]) listener();
      return recorded;
    },
    number: () => taken,
    requests: () => count,
    onRequest: (listener) => {
      listeners.push(listener);
    },
    rawParts: () => raw.filter((part): part is RawPart => part !== undefined),
  };
  exemptFromAcceptNegotiation(recorder);
  return recorder;
}

/**
 * Resolves once the handler has recorded everything it sends before an
 * answer — at least one request, then a full event-loop turn (`setImmediate`,
 * the same turn the batch connection's `execute()` yields for follow-ups)
 * passing with no new request recorded — or once the handler settled,
 * whichever is first. No timer: a handler that neither records nor settles
 * keeps the call waiting, as it would outside batch mode.
 */
export function untilSent(
  handler: Promise<unknown>,
  recorder: Recorder,
): Promise<'recorded' | 'settled'> {
  return new Promise((resolve) => {
    let done = false;
    let turning = false;
    const finish = (outcome: 'recorded' | 'settled') => {
      if (done) return;
      done = true;
      resolve(outcome);
    };
    const turn = () => {
      if (done || turning) return;
      turning = true;
      const seen = recorder.requests();
      setImmediate(() => {
        turning = false;
        if (done) return;
        if (recorder.requests() === seen) finish('recorded');
        else turn();
      });
    };
    handler.then(
      () => finish('settled'),
      () => finish('settled'),
    );
    recorder.onRequest(turn);
    if (recorder.requests() > 0) turn();
  });
}
