/**
 * RF4, http (spec §6.4, §14.5, D55): a tool holding a lock — the lock
 * answered, the update held at the stand-in — when `SIGTERM` arrives is not
 * aborted: the stand-in releases the update, and its log holds the update,
 * the `UNLOCK` and then the session's logoff before the process exits, exit
 * `0`. Two concurrent tools on two per-request instances are both awaited.
 * (The full and the compact tool set: the A7 parity suite.)
 */

import { isLogoff } from '../../../../src/__tests__/helpers/adtStandIn';
import {
  isUnlockOf,
  isUpdateOf,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { type HttpStand, httpStand, turns, until } from './harness';

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

it('the held update is released, then the UNLOCK and the logoff land before exit 0', async () => {
  const hold = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  const answered = s.call('LockedUpdate', { id: 'A' });
  await hold.arrived;

  s.processLike.emit('SIGTERM');
  await turns(20);
  expect(s.exits).toEqual([]);

  hold.release();
  expect(await s.exited).toBe(0);
  expect(await answered).toMatchObject({
    status: 200,
    text: 'A',
    isError: false,
  });
  const update = s.indexOf(isUpdateOf('A'));
  const unlock = s.indexOf(isUnlockOf('A'));
  expect(update).toBeGreaterThanOrEqual(0);
  expect(unlock).toBeGreaterThan(update);
  // The logoff was written before the exit (connection 16 resolves on the
  // write); the stand-in reads it off its socket.
  await until(() => s.standIn.logoffs() === 1);
  const logoff = s.standIn.requests.findIndex((r) => isLogoff(r.url));
  expect(logoff).toBeGreaterThan(unlock);
  expect(s.stderr).toEqual([]);
});

it('two concurrent tools on two per-request instances are both awaited', async () => {
  const holdA = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  const holdB = s.standIn.hold((r) => isUpdateOf('B')(r.url));
  const a = s.call('LockedUpdate', { id: 'A' });
  const b = s.call('LockedUpdate', { id: 'B' });
  await Promise.all([holdA.arrived, holdB.arrived]);

  s.processLike.emit('SIGTERM');
  holdA.release();
  await until(() => s.indexOf(isUnlockOf('A')) >= 0);
  await turns(20);
  expect(s.exits).toEqual([]);

  holdB.release();
  expect(await s.exited).toBe(0);
  expect((await a).text).toBe('A');
  expect((await b).text).toBe('B');
  // Each session is logged off, after its UNLOCK.
  await until(() => s.standIn.logoffs() === 2);
  const unlockB = s.indexOf(isUnlockOf('B'));
  expect(unlockB).toBeGreaterThan(s.indexOf(isUnlockOf('A')));
  expect(
    s.standIn.requests.filter((r, i) => i > unlockB && isLogoff(r.url)),
  ).toHaveLength(1);
});
