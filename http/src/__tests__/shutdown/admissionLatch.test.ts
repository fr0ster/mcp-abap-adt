/**
 * The admission latch, http (spec §6.4, §14.5): one tool's update held at
 * the stand-in; a `POST` accepted before `SIGTERM` whose body is still
 * arriving completes after it — no request of it reaches the stand-in (no
 * mutation, no connection acquired), it is answered with the shutdown
 * refusal (the pool's `503`, in the latch's tick); the earlier tool is
 * interrupted and not awaited — its connection is logged off at once, exit
 * `0`, and its `UNLOCK` never lands. (The full and the compact tool set: the
 * A7 parity suite.)
 */

import {
  isLockOf,
  isUnlockOf,
  isUpdateOf,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { POOL_CLOSED_WORDS } from '../../InstancePool.js';
import {
  basicHeaders,
  type HttpStand,
  halfPost,
  httpStand,
  turns,
  until,
} from './harness';

jest.setTimeout(30_000);

let s: HttpStand;
let errorSpy: jest.SpyInstance;

beforeEach(async () => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  s = await httpStand();
});

afterEach(async () => {
  await s.close();
  errorSpy.mockRestore();
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
  expect(await s.exited).toBe(0);
  const answered = await finished;
  expect(answered.status).toBe(503);
  expect(answered.body).toBe(POOL_CLOSED_WORDS);
  await until(() => s.standIn.logoffs() === 1);

  hold.release();
  await turns(20);
  // The update was held when the logoff went out: the UNLOCK never lands.
  expect(s.indexOf(isUnlockOf('A'))).toBe(-1);
  // Nothing of the late request reached the system: no lock, no connection.
  expect(s.indexOf(isLockOf('LATE'))).toBe(-1);
  expect(
    s.standIn.requests.filter((r) => r.url.includes('discovery')).length,
  ).toBe(connections);
});
