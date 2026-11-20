/**
 * The client closes its SSE stream (SSE closes as stdio
 * does): the logoff of every connection the instance owns — its connector,
 * held state's, a long read's own — is written at once, while a tool's
 * request is still held at the stand-in; a call queued behind it never
 * sends; the tool's later request (its `UNLOCK`) never reaches the system;
 * another stream's instance is untouched. A tool whose main-connection
 * request SAP answers after the close opens no fresh connection: no second
 * logon, nothing left owned.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, type Mock, mock } from 'node:test';
import { isLogoff } from '../../../../../src/__tests__/helpers/adtStandIn';
import { assertMatchObject } from '../../../../../src/__tests__/helpers/assertions';
import {
  isLockOf,
  isUnlockOf,
  isUpdateOf,
  listenUrl,
  longReadUrl,
  mainReadUrl,
} from '../../../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../../../src/lib/activeTools';
import { ownedConnections } from '../../../../../src/lib/ownedConnections';
import { type SseStand, sseStand, turns, until } from './harness';

let s: SseStand;
let errorSpy: Mock<typeof console.error>;
let stderrSpy: Mock<typeof process.stderr.write> | undefined;

beforeEach(async () => {
  errorSpy = mock.method(console, 'error', () => {});
  s = await sseStand();
});

afterEach(async () => {
  await s.close();
  errorSpy.mock.restore();
  stderrSpy?.mock.restore();
  stderrSpy = undefined;
});

const loggedOff = (): (string | undefined)[] =>
  s.standIn.requests.filter((r) => isLogoff(r.url)).map((r) => r.session);
const sessionOf = (match: (url: string) => boolean) =>
  s.standIn.requests.find((r) => match(r.url))?.session;

it('the stream closes under a held update: connector and state logged off at once, the queued call never sends, no UNLOCK; another stream untouched', async () => {
  const other = await s.open();
  assert.equal(await other.call('ProbeAdt', { id: 'other' }, 1), 202);
  await other.answer(1);
  const otherSession = sessionOf((url) => url.includes('/probe/other'));

  const connection = await s.open();
  assert.equal(await connection.call('HoldState', { id: 'S' }, 1), 202);
  await connection.answer(1);
  const hold = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  assert.equal(await connection.call('LockedUpdate', { id: 'A' }, 2), 202);
  await hold.arrived;
  assert.equal(await connection.call('LockedUpdate', { id: 'B' }, 3), 202);
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
  assert.ok(
    activeTools()
      .map((t) => t.name)
      .includes('LockedUpdate'),
  );

  hold.release();
  await until(() => activeTools().length === 0);
  await turns(20);
  assert.equal(s.indexOf(isUnlockOf('A')), -1);
  assert.equal(s.indexOf(isLockOf('B')), -1);
  // The stream's close and its transport's close are one close: one logoff
  // per connection.
  assert.equal(loggedOff().filter((x) => x === toolSession).length, 1);
  assert.equal(loggedOff().filter((x) => x === stateSession).length, 1);
  // The other stream's instance keeps its session and still answers.
  assert.ok(!loggedOff().includes(otherSession));
  assert.equal(await other.call('ProbeAdt', { id: 'other2' }, 2), 202);
  assertMatchObject(await other.answer(2), { isError: false });
});

it("the stream closes under a held long read: the read's own connection is logged off at once", async () => {
  const connection = await s.open();
  const hold = s.standIn.hold((r) => r.url.startsWith(longReadUrl('L')));
  assert.equal(await connection.call('LongRead', { id: 'L' }, 1), 202);
  await hold.arrived;
  const readSession = sessionOf((url) => url.startsWith(longReadUrl('L')));

  connection.close();
  await until(() => loggedOff().includes(readSession ?? ''));
  assert.deepStrictEqual(
    activeTools().map((t) => t.name),
    ['LongRead'],
  );
  // Every connection of the instance: its connector too.
  await until(() => s.standIn.logoffs() === s.connects());
  hold.release();
  await until(() => activeTools().length === 0);
});

it("SAP answers the tool's main-connection request after the close: its next step opens no fresh connection — no second logon, nothing owned", async (t) => {
  const connection = await s.open();
  const hold = s.standIn.hold((r) => r.url.startsWith(mainReadUrl('M')));
  assert.equal(await connection.call('MainThenFresh', { id: 'M' }, 1), 202);
  await hold.arrived;
  assert.equal(s.connects(), 1);

  const written: string[] = [];
  stderrSpy = t.mock.method(process.stderr, 'write', (chunk: unknown) => {
    written.push(String(chunk));
    return true;
  });
  connection.close();
  await until(() => s.standIn.logoffs() === 1);
  // SAP answers the held request: the tool goes on to its fresh connection.
  hold.release();
  await until(() => activeTools().length === 0);
  await turns(20);
  assert.equal(s.connects(), 1);
  assert.equal(
    s.indexOf((url) => url.startsWith(listenUrl('M'))),
    -1,
  );
  assert.deepStrictEqual(ownedConnections(), []);
  assert.equal(s.standIn.logoffs(), s.connects());
  // The server keeps running: the refusal is the instance's own, neither an
  // authentication failure nor a shutdown.
  const lines = written.join('');
  assert.ok(lines.includes('[MCP] instance_closed'));
  assert.ok(!lines.includes('authentication_failed'));
});
