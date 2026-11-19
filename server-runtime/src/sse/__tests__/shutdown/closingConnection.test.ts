/**
 * A process shutdown meets an SSE connection that is
 * already closing — its tool's update held at the stand-in. The connection's
 * close logged its session off at once; the shutdown joins that logoff
 * (never a second one), lets the instance go once, and exits `0` without
 * waiting for the tool.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import { BaseMcpServer } from '@mcp-abap-adt/lib/embeddable';
import { isUpdateOf } from '../../../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../../../src/lib/activeTools';
import { type SseStand, sseStand, turns, until } from './harness';

let s: SseStand;

beforeEach(async () => {
  mock.method(console, 'error', () => {});
  s = await sseStand();
});

afterEach(async () => {
  await s.close();
  mock.restoreAll();
});

it('the closing connection is joined: one logoff, one let-go, exit 0 without the tool', async (t) => {
  const letGo = t.mock.method(BaseMcpServer.prototype, 'letGoOfState');
  const connection = await s.open();
  const hold = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  await connection.call('LockedUpdate', { id: 'A' }, 1);
  await hold.arrived;
  connection.close();
  await until(() => s.standIn.logoffs() === 1);
  s.processLike.emit('SIGTERM');
  assert.equal(await s.exited, 0);
  assert.deepStrictEqual(
    activeTools().map((t) => t.name),
    ['LockedUpdate'],
  );
  await turns(20);
  assert.equal(s.standIn.logoffs(), 1);
  assert.equal(letGo.mock.callCount(), 1);
  hold.release();
  await until(() => activeTools().length === 0);
});
