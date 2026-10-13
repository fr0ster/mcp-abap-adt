/**
 * No shutdown deadline (spec §6.3, §6.4, D33): a session write the store
 * holds lands before the exit however long it takes, and without
 * `--shutdown-timeout` no timer is pending — the server keeps no clock of
 * its own over a shutdown (fake time).
 */

import { deferred, setup, turns } from './harness';

beforeEach(() => {
  jest.useFakeTimers({
    doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
  });
});

afterEach(() => {
  jest.useRealTimers();
});

it('a write held by the store lands before exit, however long it takes; no timer pending', async () => {
  const write = deferred<{ notStored: string[] }>();
  const s = setup({ settle: () => write.promise });
  s.processLike.emit('SIGTERM');
  await turns();
  expect(s.order).toContain('settle');
  expect(jest.getTimerCount()).toBe(0);
  // An hour passes: nothing gives up on the write.
  jest.advanceTimersByTime(60 * 60_000);
  await turns();
  expect(s.exits).toEqual([]);
  write.resolve({ notStored: [] });
  await turns();
  expect(s.order.slice(-2)).toEqual(['settled', 'exit(0)']);
  expect(s.exits).toEqual([0]);
});

it('with --shutdown-timeout one timer is pending, and cleared once the sequence ends', async () => {
  const s = setup({ shutdownTimeoutMs: 60_000 });
  s.processLike.emit('SIGTERM');
  expect(jest.getTimerCount()).toBe(1);
  await turns();
  expect(s.exits).toEqual([0]);
  expect(jest.getTimerCount()).toBe(0);
});
