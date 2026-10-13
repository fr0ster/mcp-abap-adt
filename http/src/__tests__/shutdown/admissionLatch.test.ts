/**
 * The admission latch, http (spec §6.4, §14.5): one tool's `UNLOCK` held at
 * the stand-in; a `POST` accepted before `SIGTERM` whose body is still
 * arriving completes after it — no request of it reaches the stand-in (no
 * mutation, no connection acquired), it is answered with the shutdown
 * refusal (the pool's `503`, in the latch's tick), and the held `UNLOCK`
 * still lands before exit. (The full and the compact tool set: the A7
 * parity suite.)
 */

import {
  isLockOf,
  isUnlockOf,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { POOL_CLOSED_WORDS } from '../../InstancePool.js';
import {
  basicHeaders,
  type HttpStand,
  halfPost,
  httpStand,
  turns,
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

it('a POST whose body completes after SIGTERM reaches no tool; the held UNLOCK still lands; exit 0', async () => {
  const hold = s.standIn.hold((r) => isUnlockOf('A')(r.url));
  const first = s.call('LockedUpdate', { id: 'A' });
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
  await turns(10);
  const answered = await late.finish();
  expect(answered.status).toBe(503);
  expect(answered.body).toBe(POOL_CLOSED_WORDS);

  hold.release();
  expect(await s.exited).toBe(0);
  expect((await first).text).toBe('A');
  expect(s.indexOf(isUnlockOf('A'))).toBeGreaterThan(0);
  // Nothing of the late request reached the system: no lock, no connection.
  expect(s.indexOf(isLockOf('LATE'))).toBe(-1);
  expect(
    s.standIn.requests.filter((r) => r.url.includes('discovery')).length,
  ).toBe(connections);
});
