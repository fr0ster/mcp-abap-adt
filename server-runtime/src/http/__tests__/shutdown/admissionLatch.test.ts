/**
 * The admission latch, http: one tool's update held at
 * the stand-in; a `POST` accepted before `SIGTERM` whose body is still
 * arriving completes after it — no request of it reaches the stand-in (no
 * mutation, no connection acquired), it is answered with the shutdown
 * refusal (the pool's `503`, in the latch's tick); the earlier tool is
 * interrupted and not awaited — its connection is logged off at once, exit
 * `0`, and its `UNLOCK` never lands. (The full and the compact tool set: the
 * parity suite.)
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, type Mock, mock } from 'node:test';
import {
  isLockOf,
  isUnlockOf,
  isUpdateOf,
} from '../../../../../src/__tests__/helpers/shutdownTools';
import { POOL_CLOSED_WORDS } from '../../InstancePool.js';
import {
  basicHeaders,
  type HttpStand,
  halfPost,
  httpStand,
  turns,
  until,
} from './harness';

let s: HttpStand;
let errorSpy: Mock<typeof console.error>;

beforeEach(async () => {
  errorSpy = mock.method(console, 'error', () => {});
  s = await httpStand();
});

afterEach(async () => {
  await s.close();
  errorSpy.mock.restore();
});

it('a POST whose body completes after SIGTERM reaches no tool; the earlier tool is not awaited; exit 0', async () => {
  const hold = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  void s.call('LockedUpdate', { id: 'A' }).catch(() => undefined);
  await hold.arrived;
  const connections = s.standIn.requests.filter((r) =>
    r.url.includes('discovery'),
  ).length;

  const late = halfPost(s.port, basicHeaders(s.standIn.url), 'LockedUpdate', {
    id: 'LATE',
  });
  await late.sent;
  // Accepted: the server has read its headers and waits for the body.
  await new Promise((r) => setTimeout(r, 100));
  s.processLike.emit('SIGTERM');
  const finished = late.finish();
  assert.equal(await s.exited, 0);
  const answered = await finished;
  assert.equal(answered.status, 503);
  assert.equal(answered.body, POOL_CLOSED_WORDS);
  await until(() => s.standIn.logoffs() === 1);

  hold.release();
  await turns(20);
  // The update was held when the logoff went out: the UNLOCK never lands.
  assert.equal(s.indexOf(isUnlockOf('A')), -1);
  // Nothing of the late request reached the system: no lock, no connection.
  assert.equal(s.indexOf(isLockOf('LATE')), -1);
  assert.equal(
    s.standIn.requests.filter((r) => r.url.includes('discovery')).length,
    connections,
  );
});
