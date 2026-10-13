/**
 * The admission latch, sse (spec §6.4, §14.5): a `POST` admitted before the
 * latch whose body completes after it reaches no tool — it is answered with
 * the shutdown refusal on the stream, no request of it reaches the stand-in
 * — while another tool's held `UNLOCK` still lands before exit. (Full and
 * compact: the A7 parity suite.)
 */

import { SHUTDOWN_SENTENCE } from '@mcp-abap-adt/lib/state';
import {
  isLockOf,
  isUnlockOf,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { halfPost, type SseStand, sseStand, turns } from './harness';

jest.setTimeout(30_000);

let s: SseStand;
let errorSpy: jest.SpyInstance;

beforeEach(async () => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  s = await sseStand();
});

afterEach(async () => {
  await s.close();
  errorSpy.mockRestore();
});

it('a POST whose body completes after SIGTERM reaches no tool; the held UNLOCK lands; exit 0', async () => {
  const connection = await s.open();
  const hold = s.standIn.hold((r) => isUnlockOf('A')(r.url));
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
  await turns(10);
  expect((await late.finish()).status).toBe(202);
  const refused = await connection.answer(2);
  expect(refused.isError).toBe(true);
  expect(JSON.parse(refused.text)).toMatchObject({
    error: 'authentication_failed',
    kind: 'interactive-login',
    server: SHUTDOWN_SENTENCE,
  });
  expect(s.indexOf(isLockOf('LATE'))).toBe(-1);
  // On the fresh connection too: refused before any connection is acquired.
  expect((await lateOnFresh.finish()).status).toBe(202);
  expect((await fresh.answer(1)).isError).toBe(true);
  expect(s.indexOf(isLockOf('FRESH'))).toBe(-1);
  expect(s.connects()).toBe(connects);

  hold.release();
  expect(await connection.answer(1)).toEqual({ text: 'A', isError: false });
  expect(await s.exited).toBe(0);
  expect(s.indexOf(isUnlockOf('A'))).toBeGreaterThan(0);
});
