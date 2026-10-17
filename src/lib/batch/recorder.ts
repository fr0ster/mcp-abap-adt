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
 *
 * A batch is homogeneous by session kind (`sessionKind.ts`): its first
 * recorded request decides LOCK, UNLOCK or stateless, and a request of
 * another kind is refused `batch_other_kind` before it is recorded — no
 * number taken by it, the batch connection's session switch undone — so
 * every batch end sends one envelope. A call whose every part is of the
 * batch's kind is recorded whole. Once a part is refused, every later part
 * of the call is refused too; the refusal is kept (`otherKind()`) and is
 * the call's answer — also when an earlier part was recorded (its words
 * then say that part is sent at the batch end, under the call's number).
 *
 * Every request the recorder hands back is raced against the batch's signal
 * (taken when the recorder is created): a drop (`drop()`, `dispose()`, the
 * instance close) aborts it, and the handler's wait for a part that will
 * never come ends with `RequestAbortedError` — adt-clients has no discard,
 * its part promise stays pending and is let go with the batch connection.
 * Nothing is sent by the drop. `BatchEnd` never aborts the signal, so an
 * executed part reaches the handler as it came.
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
import { batchOtherKindWords, ServerRefusal } from '../auth/serverRefusal';
import { raceRequestSignal } from '../requestSignal';
import type { InstanceBatch, RawPart } from './InstanceBatch';
import { requestKind, sessionKindLabel } from './sessionKind';

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
  /**
   * The refusal of the call's first request of another session kind than
   * the batch holds (`batch_other_kind`), or `undefined`: nothing of that
   * request, nor of any later one of the call, was recorded. When an
   * earlier part was recorded, its words say so, with the call's number:
   * that part is sent at the batch end, and the call's answer is this
   * refusal.
   */
  otherKind(): ServerRefusal | undefined;
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
 * is called once, with the call's number, at its first request. `tool`
 * names the call in a `batch_other_kind` refusal.
 */
export function createRecorder(
  batch: AdtBatchConnection,
  owner: InstanceBatch,
  onRecorded: (n: number) => void,
  tool: string,
): Recorder {
  const dropped = owner.signal();
  const endpoint = owner.mode() === 'debugger' ? 'debugger' : 'communication';
  // The batch connection's default session, which its own recording of a
  // request falls back to (adt-clients: stateful only for the debugger).
  const unswitched: Session =
    endpoint === 'debugger' ? 'stateful' : 'stateless';
  let refused: ServerRefusal | undefined;
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
      // Of the batch's kind, or refused before anything is recorded: the
      // batch connection's session switch, scoped to this request, is
      // undone as its own recording would undo it. Once a part of the call
      // was refused, every later part is refused with it: the call records
      // nothing more and takes no number.
      const kind = requestKind(request, batch.getSessionType(), endpoint);
      const holds = owner.kind();
      if (refused !== undefined || (holds !== undefined && holds !== kind)) {
        batch.setSessionType(unswitched);
        refused ??= new ServerRefusal(
          'batch_other_kind',
          batchOtherKindWords(
            tool,
            sessionKindLabel(kind),
            sessionKindLabel(holds ?? kind),
            taken,
          ),
        );
        const rejected = Promise.reject<IAdtWireResponse<T, D>>(refused);
        // A handler that never reads it leaves no unhandled rejection: the
        // dispatch answers the refusal (`otherKind()`).
        rejected.catch(() => undefined);
        return rejected;
      }
      // Recorded first: a call takes its number only once a request of it
      // is in the envelope — a batch connection that throws takes none.
      const recorded = batch.makeAdtRequest<T, D>(request);
      owner.recorded(kind);
      if (taken === undefined) {
        taken = owner.nextNumber();
        onRecorded(taken);
      }
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
      const answered = raceRequestSignal(recorded, dropped);
      // A handler that left (it threw on an earlier part) never reads this
      // one: its rejection — the drop's above all — is never unhandled.
      answered.catch(() => undefined);
      return answered;
    },
    number: () => taken,
    requests: () => count,
    onRequest: (listener) => {
      listeners.push(listener);
    },
    rawParts: () => raw.filter((part): part is RawPart => part !== undefined),
    otherKind: () => refused,
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
