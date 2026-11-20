/**
 * No shutdown deadline: a session write the store
 * holds lands before the exit however long it takes, and without
 * `--shutdown-timeout` no timer is pending — the server keeps no clock of
 * its own over a shutdown (fake time).
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import {
  getTimerCount,
  useFakeTimers,
  useRealTimers,
} from '../../../../../src/__tests__/helpers/fakeTime';
import { deferred, setup, turns } from './harness';

beforeEach(() => {
  useFakeTimers({ apis: ['setTimeout', 'setInterval', 'Date'] });
});

afterEach(() => {
  useRealTimers();
});

it('a write held by the store lands before exit, however long it takes; no timer pending', async () => {
  const write = deferred<{ notStored: string[] }>();
  const s = setup({ settle: () => write.promise });
  s.processLike.emit('SIGTERM');
  await turns();
  assert.ok(s.order.includes('settle'));
  assert.equal(getTimerCount(), 0);
  // An hour passes: nothing gives up on the write.
  mock.timers.tick(60 * 60_000);
  await turns();
  assert.deepStrictEqual(s.exits, []);
  write.resolve({ notStored: [] });
  await turns();
  assert.deepStrictEqual(s.order.slice(-2), ['settled', 'exit(0)']);
  assert.deepStrictEqual(s.exits, [0]);
});

it('with --shutdown-timeout one timer is pending, and cleared once the sequence ends', async () => {
  const s = setup({ shutdownTimeoutMs: 60_000 });
  s.processLike.emit('SIGTERM');
  assert.equal(getTimerCount(), 1);
  await turns();
  assert.deepStrictEqual(s.exits, [0]);
  assert.equal(getTimerCount(), 0);
});
