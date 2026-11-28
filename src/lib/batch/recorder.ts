/**
 * The per-call recorder: the connection a recorded call's handler is given
 * in batch mode, over the open batch's `AdtBatchConnection`.
 *
 * Every member forwards to the batch connection, so a request is recorded,
 * never sent: its part settles when the batch end executes the batch, and the
 * promise the handler awaits settles with that part only once the call's
 * number is read (`release()`, spec §6) — the batch end resumes no handler.
 * Once the batch has ended (or was dropped), a request is not recorded: it
 * is refused `batch_ended`, and that refusal is what the resumed handler
 * meets.
 * At the call's first `makeAdtRequest` the recorder takes the batch's next
 * number for the call and keeps it for every further request of the call —
 * a call may put several independent parts into the envelope (a source and
 * its metadata), all under its one number. A call that records nothing takes
 * no number.
 *
 * Nothing recorded is corrected or sent again: the recorded call runs as a
 * recorded call (`asRecordedCall`, the dispatch's), so a `406`/`415` part is
 * that call's answer.
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
 * instance close), a failed the batch end and the replacement of the batch's
 * map abort it, and the handler's wait for a part it will never be given
 * ends with `RequestAbortedError` — adt-clients has no discard, its part
 * promise stays pending and is let go with the batch connection. Nothing is
 * sent by the drop. An end that keeps the map never aborts the signal, so
 * an executed part reaches the handler, when read, as it came.
 */

import type { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { batchOtherKindWords, ServerRefusal } from '../auth/serverRefusal';
import { raceRequestSignal } from '../requestSignal';
import { child, entries, isList } from '../thrownValue';
import { wireValueOf } from '../wireValue';
import type { InstanceBatch, PartSettlement, RawPart } from './InstanceBatch';
import { requestKind, type SessionKind, sessionKindLabel } from './sessionKind';

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
  /** How each request's part settled, in the order recorded. */
  parts(): PartSettlement[];
  /** The call's number was read: every request the handler awaits settles with its part. */
  release(): void;
}

/** A part's body as text: a string as it is, anything else as JSON; none is empty. */
function bodyText(response: Pick<IAdtWireResponse, 'data'>): string {
  const data = wireValueOf(response.data);
  if (data.kind === 'undefined' || data.kind === 'null') return '';
  return data.kind === 'text' ? data.text : JSON.stringify(response.data);
}

/** A header's value as one line: a list joined, anything else as text. */
function headerLine(value: IAdtWireResponse['headers'][string]): string {
  return Array.isArray(value) ? value.join(', ') : String(value);
}

/** The raw part of a settled request: its inner response. */
function rawPartOf(response: IAdtWireResponse): RawPart {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers)) {
    if (value === undefined || value === null) continue;
    headers[name] = headerLine(value);
  }
  return {
    status: response.status,
    status_text: response.statusText,
    headers,
    body: bodyText(response),
  };
}

/**
 * The raw part of a request that threw: its `response`, read from a thrown
 * value, field by field.
 */
function thrownRawPart(response: unknown): RawPart | undefined {
  const status = child(response, 'status');
  if (typeof status !== 'number') return undefined;
  const headers: Record<string, string> = {};
  for (const [name, value] of entries(child(response, 'headers'))) {
    if (value === undefined || value === null) continue;
    headers[name] = isList(value) ? value.join(', ') : String(value);
  }
  const statusText = child(response, 'statusText');
  return {
    status,
    status_text: typeof statusText === 'string' ? statusText : '',
    headers,
    body: bodyText({ data: child(response, 'data') }),
  };
}

/**
 * What a recorder records into, and the batch it records for: the owner's
 * numbering, the session kind the batch holds, the signal the call's waits
 * race, and the request's recording itself — into an `AdtBatchConnection`
 * (`batchTarget`, compact batch mode and the debugger batch) or kept as a
 * pending part (an envelope).
 */
export interface RecordingTarget {
  /** Which batch endpoint the requests are for: the debugger's is stateful by default. */
  readonly endpoint: 'communication' | 'debugger';
  /** Whether each recorded call keeps its raw parts. */
  readonly keepRawParts: boolean;
  /** The signal the call's waits race: aborted when the call is let go. */
  signal(): AbortSignal;
  /** Whether the batch is still open: once it is not, a request is refused `batch_ended`. */
  open(): boolean;
  /** The session kind the batch holds: its first recorded request's. */
  kind(): SessionKind | undefined;
  /** A request of `kind` was recorded. */
  recorded(kind: SessionKind): void;
  /** The batch's next number. */
  nextNumber(): number;
  /**
   * The refusal of `request` before it is recorded, when the batch refuses
   * it beside the session kind (an envelope's second node structure);
   * `number` is the call's, when a part of it was recorded. Absent: none.
   */
  admit?(
    request: IAbapRequestOptions,
    number: number | undefined,
  ): ServerRefusal | undefined;
  /** Records `request` (it may throw, recording nothing): its part, settled when the batch is sent. */
  record(request: IAbapRequestOptions): Promise<IAdtWireResponse>;
  connect(): Promise<void>;
  getBaseUrl(): Promise<string | undefined>;
  getSessionId(): string | null;
  setSessionType(type: Session): void;
  getSessionType(): Session;
}

/** The target of a call of `owner`'s open batch, recorded into `batch`. */
export function batchTarget(
  batch: AdtBatchConnection,
  owner: InstanceBatch,
): RecordingTarget {
  return {
    endpoint: owner.mode() === 'debugger' ? 'debugger' : 'communication',
    keepRawParts: owner.keepRawParts,
    signal: () => owner.signal(),
    open: () => owner.opened()?.connection === batch,
    kind: () => owner.kind(),
    recorded: (kind) => owner.recorded(kind),
    nextNumber: () => owner.nextNumber(),
    record: (request) => batch.makeAdtRequest(request),
    connect: () => batch.connect(),
    getBaseUrl: () => batch.getBaseUrl(),
    getSessionId: () => batch.getSessionId(),
    setSessionType: (type) => batch.setSessionType(type),
    getSessionType: () => batch.getSessionType(),
  };
}

/**
 * A recorder over `target` for one call. `onRecorded` is called once, with
 * the call's number, at its first request. `tool` names the call in a
 * `batch_other_kind` refusal.
 */
export function createRecorder(
  target: RecordingTarget,
  onRecorded: (n: number) => void,
  tool: string,
): Recorder {
  const dropped = target.signal();
  const endpoint = target.endpoint;
  // The batch connection's default session, which its own recording of a
  // request falls back to (adt-clients: stateful only for the debugger).
  const unswitched: Session =
    endpoint === 'debugger' ? 'stateful' : 'stateless';
  let refused: ServerRefusal | undefined;
  let taken: number | undefined;
  let count = 0;
  const listeners: Array<() => void> = [];
  const raw: Array<RawPart | undefined> = [];
  const settled: PartSettlement[] = [];
  let release: () => void = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Once the batch has ended (or was dropped), the handler — resumed when
  // its number is read — reaches no connection: what it would reach is
  // refused `batch_ended`, as a further request is.
  const ended = () => !target.open();
  const endedRefusal = <T>(): Promise<T> =>
    Promise.reject<T>(new ServerRefusal('batch_ended'));
  const recorder: Recorder = {
    connect: () => (ended() ? endedRefusal<void>() : target.connect()),
    getBaseUrl: () =>
      ended() ? endedRefusal<string | undefined>() : target.getBaseUrl(),
    getSessionId: () => target.getSessionId(),
    setSessionType: (type) => target.setSessionType(type),
    getSessionType: () => target.getSessionType(),
    makeAdtRequest(request: IAbapRequestOptions): Promise<IAdtWireResponse> {
      // Of the batch's kind, or refused before anything is recorded: the
      // batch connection's session switch, scoped to this request, is
      // undone as its own recording would undo it. Once a part of the call
      // was refused, every later part is refused with it: the call records
      // nothing more and takes no number.
      // The batch ended (or was dropped): nothing more is recorded or sent.
      if (ended()) {
        target.setSessionType(unswitched);
        const ended = Promise.reject<IAdtWireResponse>(
          new ServerRefusal('batch_ended'),
        );
        ended.catch(() => undefined);
        return ended;
      }
      const kind = requestKind(request, target.getSessionType(), endpoint);
      const holds = target.kind();
      if (refused !== undefined || (holds !== undefined && holds !== kind)) {
        target.setSessionType(unswitched);
        refused ??= new ServerRefusal(
          'batch_other_kind',
          batchOtherKindWords(
            tool,
            sessionKindLabel(kind),
            sessionKindLabel(holds ?? kind),
            taken,
          ),
        );
        const rejected = Promise.reject<IAdtWireResponse>(refused);
        // A handler that never reads it leaves no unhandled rejection: the
        // dispatch answers the refusal (`otherKind()`).
        rejected.catch(() => undefined);
        return rejected;
      }
      // The batch's own refusal of the request (an envelope's second node
      // structure): as a refusal of its kind, nothing recorded, every later
      // part of the call refused with it.
      const admitted = target.admit?.(request, taken);
      if (admitted !== undefined) {
        refused ??= admitted;
        const rejected = Promise.reject<IAdtWireResponse>(refused);
        rejected.catch(() => undefined);
        return rejected;
      }
      // Recorded first: a call takes its number only once a request of it
      // is in the envelope — a batch connection that throws takes none.
      const recorded = target.record(request);
      target.recorded(kind);
      if (taken === undefined) {
        taken = target.nextNumber();
        onRecorded(taken);
      }
      count += 1;
      const at = settled.length;
      settled.push({ state: 'pending' });
      recorded.then(
        (value) => {
          settled[at] = { state: 'resolved', value };
        },
        (error: unknown) => {
          settled[at] = { state: 'rejected', error };
        },
      );
      if (target.keepRawParts) {
        const index = raw.length;
        raw.push(undefined);
        recorded.then(
          (response) => {
            raw[index] = rawPartOf(response);
          },
          (error: unknown) => {
            raw[index] = thrownRawPart(child(error, 'response'));
          },
        );
      }
      for (const listener of [...listeners]) listener();
      // The handler meets its part only when its number is read.
      const answered = raceRequestSignal(
        released.then(() => recorded),
        dropped,
      );
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
    parts: () => [...settled],
    release: () => release(),
  };
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
export function untilSent<T>(
  handler: Promise<T>,
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
