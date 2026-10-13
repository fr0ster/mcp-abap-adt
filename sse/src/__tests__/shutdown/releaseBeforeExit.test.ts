/**
 * RF4, sse (spec §6.4, §14.5, D55): a tool holding a lock — the update held
 * at the stand-in — when `SIGTERM` arrives is not aborted: the update, the
 * `UNLOCK` and then the session's logoff reach the stand-in, exit `0`; every
 * open connection's instance is disposed only after its tools settled, its
 * connections logged off. (Full and compact: the A7 parity suite.)
 */

import { isLogoff } from '../../../../src/__tests__/helpers/adtStandIn';
import {
  isUnlockOf,
  isUpdateOf,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { ownedConnections } from '../../../../src/lib/ownedConnections';
import { type SseStand, sseStand, turns, until } from './harness';

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

it('the held update is released, then the UNLOCK and the logoff land; exit 0; an idle connection is closed too', async () => {
  const busy = await s.open();
  const idle = await s.open();
  const hold = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  expect(await busy.call('LockedUpdate', { id: 'A' }, 1)).toBe(202);
  await hold.arrived;
  // The idle connection has a session too.
  expect(await idle.call('ProbeAdt', { id: 'idle' }, 2)).toBe(202);
  await idle.answer(2);

  s.processLike.emit('SIGTERM');
  await turns(20);
  expect(s.exits).toEqual([]);
  // No instance is disposed while a tool runs: no logoff yet.
  expect(s.standIn.logoffs()).toBe(0);

  hold.release();
  expect(await busy.answer(1)).toEqual({ text: 'A', isError: false });
  expect(await s.exited).toBe(0);
  const unlock = s.indexOf(isUnlockOf('A'));
  expect(unlock).toBeGreaterThan(s.indexOf(isUpdateOf('A')));
  await until(() => s.standIn.logoffs() === s.connects());
  expect(s.standIn.requests.findIndex((r) => isLogoff(r.url))).toBeGreaterThan(
    unlock,
  );
  expect(ownedConnections()).toEqual([]);
  // Each stream was ended.
  await until(() => busy.ended() && idle.ended());
});
