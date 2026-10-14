/**
 * The client closes its SSE stream (owner's ruling: SSE closes as stdio
 * does): the logoff of every connection the instance owns — its connector,
 * held state's, a long read's own — is written at once, while a tool's
 * request is still held at the stand-in; a call queued behind it never
 * sends; the tool's later request (its `UNLOCK`) never reaches the system;
 * another stream's instance is untouched. A tool whose main-connection
 * request SAP answers after the close opens no fresh connection: no second
 * logon, nothing left owned.
 */

import { isLogoff } from '../../../../src/__tests__/helpers/adtStandIn';
import {
  isLockOf,
  isUnlockOf,
  isUpdateOf,
  listenUrl,
  longReadUrl,
  mainReadUrl,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../../src/lib/activeTools';
import { ownedConnections } from '../../../../src/lib/ownedConnections';
import { type SseStand, sseStand, turns, until } from './harness';

jest.setTimeout(30_000);

let s: SseStand;
let errorSpy: jest.SpyInstance;
let stderrSpy: jest.SpyInstance | undefined;

beforeEach(async () => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  s = await sseStand();
});

afterEach(async () => {
  await s.close();
  errorSpy.mockRestore();
  stderrSpy?.mockRestore();
  stderrSpy = undefined;
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

it("SAP answers the tool's main-connection request after the close: its next step opens no fresh connection — no second logon, nothing owned", async () => {
  const connection = await s.open();
  const hold = s.standIn.hold((r) => r.url.startsWith(mainReadUrl('M')));
  expect(await connection.call('MainThenFresh', { id: 'M' }, 1)).toBe(202);
  await hold.arrived;
  expect(s.connects()).toBe(1);

  const written: string[] = [];
  const stderr = jest
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });
  const written: string[] = [];
  stderrSpy = jest
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });
  connection.close();
  await until(() => s.standIn.logoffs() === 1);
  // SAP answers the held request: the tool goes on to its fresh connection.
  hold.release();
  await until(() => activeTools().length === 0);
  await turns(20);
  expect(s.connects()).toBe(1);
  expect(s.indexOf((url) => url.startsWith(listenUrl('M')))).toBe(-1);
  expect(ownedConnections()).toEqual([]);
  expect(s.standIn.logoffs()).toBe(s.connects()); // The server keeps running: the refusal is the instance's own, neither an
  // authentication failure nor a shutdown.
  const lines = written.join('');
  expect(lines).toContain('[MCP] instance_closed');
  expect(lines).not.toContain('authentication_failed');
});
