/**
 * The process shutdown, sse: on `SIGTERM` every
 * connection the process owns is logged off at once and every running tool
 * interrupted — a tool whose update the stand-in holds is not awaited: its
 * session is logged off under the held update, exit `0`, its `UNLOCK`
 * never lands; an idle connection's session is logged off too, and every
 * stream is ended. (Full and compact: the parity suite.)
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, type Mock, mock } from 'node:test';
import {
  isUnlockOf,
  isUpdateOf,
} from '../../../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../../../src/lib/activeTools';
import { ownedConnections } from '../../../../../src/lib/ownedConnections';
import { type SseStand, sseStand, turns, until } from './harness';

let s: SseStand;
let errorSpy: Mock<typeof console.error>;

beforeEach(async () => {
  errorSpy = mock.method(console, 'error', () => {});
  s = await sseStand();
});

afterEach(async () => {
  await s.close();
  errorSpy.mock.restore();
});

it('the logoffs at once under the held update; exit 0 without the tool; an idle connection is logged off too; every stream ended', async () => {
  const busy = await s.open();
  const idle = await s.open();
  const hold = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  assert.equal(await busy.call('LockedUpdate', { id: 'A' }, 1), 202);
  await hold.arrived;
  // The idle connection has a session too.
  assert.equal(await idle.call('ProbeAdt', { id: 'idle' }, 2), 202);
  await idle.answer(2);

  s.processLike.emit('SIGTERM');
  assert.equal(await s.exited, 0);
  assert.deepStrictEqual(
    activeTools().map((t) => t.name),
    ['LockedUpdate'],
  );
  assert.deepStrictEqual(ownedConnections(), []);
  await until(() => s.standIn.logoffs() === s.connects());
  assert.equal(s.standIn.logoffs(), 2);
  // Each stream was ended.
  await until(() => busy.ended() && idle.ended());

  hold.release();
  await until(() => activeTools().length === 0);
  await turns(20);
  assert.equal(s.indexOf(isUnlockOf('A')), -1);
});
