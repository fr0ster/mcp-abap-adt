/**
 * Closing the hard-mode runner's servers (`closeEvery`, what `hardRunner`'s
 * close does): every launch that resolved is closed, also when another one
 * rejected, and the failures are reported together afterwards.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { assertRejects } from '../../helpers/assertions';
import { closeEvery } from '../../integration/helpers/launchedServers';

describe('closeEvery', () => {
  it('a rejected launch does not keep a resolved one from closing', async () => {
    const close = mock.fn(async () => {});
    const failure = new Error('the compact launch failed');
    const closing = closeEvery([
      Promise.reject(failure),
      Promise.resolve({ close }),
    ]);
    await assertRejects(
      closing,
      '1 hard-mode server(s) failed to launch or stop',
    );
    await closing.catch((error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.deepStrictEqual(
        error instanceof AggregateError ? error.errors : [],
        [failure],
      );
    });
    assert.equal(close.mock.callCount(), 1);
  });

  it('nothing failed: nothing thrown, every launch closed', async () => {
    const first = mock.fn(async () => {});
    const second = mock.fn(async () => {});
    assert.equal(
      await closeEvery([
        Promise.resolve({ close: first }),
        Promise.resolve({ close: second }),
      ]),
      undefined,
    );
    assert.deepStrictEqual(
      [first.mock.calls.length, second.mock.calls.length],
      [1, 1],
    );
  });
});
