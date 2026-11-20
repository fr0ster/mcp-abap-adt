/**
 * The admission latch, sse: `POST`s admitted before the
 * latch whose bodies complete after it reach no tool — no request of them
 * reaches the stand-in, no connection is built for them — while another
 * tool, its update held, is interrupted and not awaited: its session is
 * logged off at once, exit `0`, its `UNLOCK` never lands. (The answer a
 * latched call gets: `closeDuringPost.test.ts` and core's suite. Full and
 * compact: the parity suite.)
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, type Mock, mock } from 'node:test';
import {
  isLockOf,
  isUnlockOf,
  isUpdateOf,
} from '../../../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../../../src/lib/activeTools';
import { halfPost, type SseStand, sseStand, turns, until } from './harness';

let s: SseStand;
let errorSpy: Mock<typeof console.error>;

beforeEach(async () => {
  errorSpy = mock.method(console, 'error', () => {});
  s = await sseStand();
});

afterEach(async () => {
  await s.close();
  errorSpy.mock.restore();
});

it('POSTs whose bodies complete after SIGTERM reach no tool; the running tool is not awaited; exit 0', async () => {
  const connection = await s.open();
  const hold = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  await connection.call('LockedUpdate', { id: 'A' }, 1);
  await hold.arrived;
  // A second connection, open but with no call yet: no connection of its
  // own is built until a call needs one.
  const fresh = await s.open();
  const connects = s.connects();

  const late = halfPost(
    s.port,
    connection.postPath,
    'LockedUpdate',
    { id: 'LATE' },
    2,
  );
  const lateOnFresh = halfPost(
    s.port,
    fresh.postPath,
    'LockedUpdate',
    { id: 'FRESH' },
    1,
  );
  await lateOnFresh.sent;
  await late.sent;
  await new Promise((r) => setTimeout(r, 100));
  s.processLike.emit('SIGTERM');
  void late.finish().catch(() => undefined);
  void lateOnFresh.finish().catch(() => undefined);
  assert.equal(await s.exited, 0);
  await until(() => s.standIn.logoffs() === connects);

  hold.release();
  await until(() => activeTools().length === 0);
  await turns(20);
  assert.equal(s.indexOf(isLockOf('LATE')), -1);
  assert.equal(s.indexOf(isLockOf('FRESH')), -1);
  assert.equal(s.connects(), connects);
  assert.equal(s.indexOf(isUnlockOf('A')), -1);
});
