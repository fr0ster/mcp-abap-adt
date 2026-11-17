/**
 * Closing the hard-mode runner's servers (`closeEvery`, what `hardRunner`'s
 * close does): every launch that resolved is closed, also when another one
 * rejected, and the failures are reported together afterwards.
 */

import { closeEvery } from '../../integration/helpers/launchedServers';

describe('closeEvery', () => {
  it('a rejected launch does not keep a resolved one from closing', async () => {
    const close = jest.fn(async () => {});
    const failure = new Error('the compact launch failed');
    const closing = closeEvery([
      Promise.reject(failure),
      Promise.resolve({ close }),
    ]);
    await expect(closing).rejects.toThrow(
      '1 hard-mode server(s) failed to launch or stop',
    );
    await closing.catch((error: unknown) => {
      expect(error).toBeInstanceOf(AggregateError);
      expect(error instanceof AggregateError ? error.errors : []).toEqual([
        failure,
      ]);
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('nothing failed: nothing thrown, every launch closed', async () => {
    const first = jest.fn(async () => {});
    const second = jest.fn(async () => {});
    await expect(
      closeEvery([
        Promise.resolve({ close: first }),
        Promise.resolve({ close: second }),
      ]),
    ).resolves.toBeUndefined();
    expect([first.mock.calls.length, second.mock.calls.length]).toEqual([1, 1]);
  });
});
