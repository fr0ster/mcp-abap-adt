/**
 * The client closes its SSE stream (owner's ruling: SSE closes as stdio
 * does): the logoff of every connection the instance owns — its connector,
 * held state's, a long read's own — is written at once, while a tool's
 * request is still held at the stand-in; a call queued behind it never
 * sends; the tool's later request (its `UNLOCK`) never reaches the system;
 * another stream's instance is untouched.
 */

import { isLogoff } from '../../../../src/__tests__/helpers/adtStandIn';
import {
  isLockOf,
  isUnlockOf,
  isUpdateOf,
  longReadUrl,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../../src/lib/activeTools';
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

const loggedOff = () =>
  s.standIn.requests.filter((r) => isLogoff(r.url)).map((r) => r.session);
const sessionOf = (match: (url: string) => boolean) =>
  s.standIn.requests.find((r) => match(r.url))?.session;

it('the stream closes under a held update: connector and state logged off at once, the queued call never sends, no UNLOCK; another stream untouched', async () => {
  const other = await s.open();
  expect(await other.call('ProbeAdt', { id: 'other' }, 1)).toBe(202);
  await other.answer(1);
  const otherSession = sessionOf((url) => url.includes('/probe/other'));

  const connection = await s.open();
  expect(await connection.call('HoldState', { id: 'S' }, 1)).toBe(202);
  await connection.answer(1);
  const hold = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  expect(await connection.call('LockedUpdate', { id: 'A' }, 2)).toBe(202);
  await hold.arrived;
  expect(await connection.call('LockedUpdate', { id: 'B' }, 3)).toBe(202);
  await turns(10);
  const toolSession = sessionOf(isUpdateOf('A'));
  const stateSession = sessionOf((url) => url.includes('/debugger/listen/S'));

  connection.close();
  // Both logoffs reach the system while the update is still held.
  await until(
    () =>
      loggedOff().includes(toolSession ?? '') &&
      loggedOff().includes(stateSession ?? ''),
  );
  expect(activeTools().map((t) => t.name)).toContain('LockedUpdate');

  hold.release();
  await until(() => activeTools().length === 0);
  await turns(20);
  expect(s.indexOf(isUnlockOf('A'))).toBe(-1);
  expect(s.indexOf(isLockOf('B'))).toBe(-1);
  // The other stream's instance keeps its session and still answers.
  expect(loggedOff()).not.toContain(otherSession);
  expect(await other.call('ProbeAdt', { id: 'other2' }, 2)).toBe(202);
  expect(await other.answer(2)).toMatchObject({ isError: false });
});

it("the stream closes under a held long read: the read's own connection is logged off at once", async () => {
  const connection = await s.open();
  const hold = s.standIn.hold((r) => r.url.startsWith(longReadUrl('L')));
  expect(await connection.call('LongRead', { id: 'L' }, 1)).toBe(202);
  await hold.arrived;
  const readSession = sessionOf((url) => url.startsWith(longReadUrl('L')));

  connection.close();
  await until(() => loggedOff().includes(readSession ?? ''));
  expect(activeTools().map((t) => t.name)).toEqual(['LongRead']);
  // Every connection of the instance: its connector too.
  await until(() => s.standIn.logoffs() === s.connects());
  hold.release();
  await until(() => activeTools().length === 0);
});
