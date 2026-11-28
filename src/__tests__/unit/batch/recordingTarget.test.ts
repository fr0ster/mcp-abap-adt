/**
 * The recorder over a `RecordingTarget`: what it records into is the
 * target's, not an `AdtBatchConnection` it must hold. A target that keeps
 * each request as a pending part (as an envelope does) gets one number per
 * call, however many requests the call records; the call's waits race the
 * target's own signal; a request of another session kind than the target
 * holds is refused `batch_other_kind`, nothing recorded.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { ServerRefusal } from '../../../lib/auth/serverRefusal';
import {
  createRecorder,
  type RecordingTarget,
} from '../../../lib/batch/recorder';
import type { SessionKind } from '../../../lib/batch/sessionKind';
import { rejectionOf } from '../../helpers/assertions';

/** A target that keeps every request as a pending part, answered by `answer`. */
function pendingTarget(signal: AbortSignal) {
  const recorded: IAbapRequestOptions[] = [];
  const answers: Array<(response: IAdtWireResponse) => void> = [];
  let holds: SessionKind | undefined;
  let counter = 0;
  const target: RecordingTarget = {
    endpoint: 'communication',
    keepRawParts: false,
    signal: () => signal,
    open: () => true,
    kind: () => holds,
    recorded: (kind) => {
      holds ??= kind;
    },
    nextNumber: () => {
      counter += 1;
      return counter;
    },
    record: (request) => {
      recorded.push(request);
      return new Promise<IAdtWireResponse>((resolve) => {
        answers.push(resolve);
      });
    },
    connect: async () => undefined,
    getBaseUrl: async () => 'https://system.invalid',
    getSessionId: () => null,
    setSessionType: () => undefined,
    getSessionType: () => 'stateless',
  };
  return { target, recorded, answers };
}

const get = (url: string): IAbapRequestOptions => ({
  url,
  method: 'GET',
  timeout: 0,
});

describe('the recorder over a RecordingTarget', () => {
  it('a call of several requests takes one number, every request kept by the target', () => {
    const { target, recorded } = pendingTarget(new AbortController().signal);
    const numbers: number[] = [];
    const recorder = createRecorder(
      target,
      (n) => numbers.push(n),
      'GetObjectDraft',
    );
    void recorder.makeAdtRequest(get('/a')).catch(() => undefined);
    void recorder.makeAdtRequest(get('/b')).catch(() => undefined);
    void recorder.makeAdtRequest(get('/c')).catch(() => undefined);
    assert.deepStrictEqual(numbers, [1]);
    assert.equal(recorder.number(), 1);
    assert.equal(recorder.requests(), 3);
    assert.deepStrictEqual(
      recorded.map((r) => r.url),
      ['/a', '/b', '/c'],
    );
  });

  it("the call's wait races the target's own signal: an abort ends it", async () => {
    const controller = new AbortController();
    const { target } = pendingTarget(controller.signal);
    const recorder = createRecorder(target, () => undefined, 'GetClass');
    const answered = recorder.makeAdtRequest(get('/a'));
    recorder.release();
    controller.abort();
    const error = await rejectionOf(answered);
    assert.ok(error instanceof Error);
  });

  it('released, a part reaches the handler as the target answered it', async () => {
    const { target, answers } = pendingTarget(new AbortController().signal);
    const recorder = createRecorder(target, () => undefined, 'GetClass');
    const answered = recorder.makeAdtRequest(get('/a'));
    answers[0]?.({ status: 200, statusText: 'OK', headers: {}, data: 'x' });
    recorder.release();
    assert.equal((await answered).data, 'x');
  });

  it('a request of another session kind than the target holds is refused batch_other_kind, nothing recorded', async () => {
    const { target, recorded } = pendingTarget(new AbortController().signal);
    const numbers: number[] = [];
    const recorder = createRecorder(target, (n) => numbers.push(n), 'GetClass');
    void recorder.makeAdtRequest(get('/a')).catch(() => undefined);
    const lock = recorder.makeAdtRequest({
      url: '/a?_action=LOCK&accessMode=MODIFY',
      method: 'POST',
      timeout: 0,
      headers: { 'X-sap-adt-sessiontype': 'stateful' },
    });
    const refusal = await rejectionOf(lock);
    assert.ok(refusal instanceof ServerRefusal);
    assert.equal(refusal.serverRefusal, 'batch_other_kind');
    assert.deepStrictEqual(
      recorded.map((r) => r.url),
      ['/a'],
    );
    assert.deepStrictEqual(numbers, [1]);
  });
});
