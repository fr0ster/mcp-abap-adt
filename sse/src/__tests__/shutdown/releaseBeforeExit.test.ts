/**
 * The process shutdown, sse: on `SIGTERM` every
 * connection the process owns is logged off at once and every running tool
 * interrupted — a tool whose update the stand-in holds is not awaited: its
 * session is logged off under the held update, exit `0`, its `UNLOCK`
 * never lands; an idle connection's session is logged off too, and every
 * stream is ended. (Full and compact: the parity suite.)
 */

import {
  isUnlockOf,
  isUpdateOf,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../../src/lib/activeTools';
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

it('the logoffs at once under the held update; exit 0 without the tool; an idle connection is logged off too; every stream ended', async () => {
  const busy = await s.open();
  const idle = await s.open();
  const hold = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  expect(await busy.call('LockedUpdate', { id: 'A' }, 1)).toBe(202);
  await hold.arrived;
  // The idle connection has a session too.
  expect(await idle.call('ProbeAdt', { id: 'idle' }, 2)).toBe(202);
  await idle.answer(2);

  s.processLike.emit('SIGTERM');
  expect(await s.exited).toBe(0);
  expect(activeTools().map((t) => t.name)).toEqual(['LockedUpdate']);
  expect(ownedConnections()).toEqual([]);
  await until(() => s.standIn.logoffs() === s.connects());
  expect(s.standIn.logoffs()).toBe(2);
  // Each stream was ended.
  await until(() => busy.ended() && idle.ended());

  hold.release();
  await until(() => activeTools().length === 0);
  await turns(20);
  expect(s.indexOf(isUnlockOf('A'))).toBe(-1);
});
