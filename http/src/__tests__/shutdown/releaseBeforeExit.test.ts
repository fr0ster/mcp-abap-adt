/**
 * The process shutdown, http: on `SIGTERM` every
 * connection the process owns is logged off at once and every running tool
 * interrupted — a tool whose update the stand-in holds is not awaited: its
 * session's logoff reaches the system while the update is still held, the
 * exit is `0`, and its `UNLOCK` never lands (the logoff released the lock).
 * Two concurrent tools on two per-request instances: both sessions logged
 * off at once. (The full and the compact tool set: the parity suite.)
 */

import {
  isUnlockOf,
  isUpdateOf,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../../src/lib/activeTools';
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

it('the logoff is written under the held update, exit 0 without waiting for the tool; no UNLOCK', async () => {
  const hold = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  void s.call('LockedUpdate', { id: 'A' }).catch(() => undefined);
  await hold.arrived;

  s.processLike.emit('SIGTERM');
  expect(await s.exited).toBe(0);
  // The tool still runs: its update is held.
  expect(activeTools().map((t) => t.name)).toEqual(['LockedUpdate']);
  await until(() => s.standIn.logoffs() === 1);
  expect(s.stderr).toEqual([]);

  hold.release();
  await until(() => activeTools().length === 0);
  await turns(20);
  expect(s.indexOf(isUnlockOf('A'))).toBe(-1);
});

it('two concurrent tools on two per-request instances: both sessions logged off at once, neither awaited', async () => {
  const holdA = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  const holdB = s.standIn.hold((r) => isUpdateOf('B')(r.url));
  void s.call('LockedUpdate', { id: 'A' }).catch(() => undefined);
  void s.call('LockedUpdate', { id: 'B' }).catch(() => undefined);
  await Promise.all([holdA.arrived, holdB.arrived]);

  s.processLike.emit('SIGTERM');
  expect(await s.exited).toBe(0);
  await until(() => s.standIn.logoffs() === 2);
  expect(activeTools()).toHaveLength(2);

  holdA.release();
  holdB.release();
  await until(() => activeTools().length === 0);
  await turns(20);
  expect(s.indexOf(isUnlockOf('A'))).toBe(-1);
  expect(s.indexOf(isUnlockOf('B'))).toBe(-1);
});
