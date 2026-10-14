/**
 * RF7 (spec §6.4, D51): a process shutdown meets an SSE connection that is
 * already closing — its tool's update held at the stand-in. The connection's
 * close logged its session off at once; the shutdown joins that logoff
 * (never a second one), lets the instance go once, and exits `0` without
 * waiting for the tool.
 */

import { BaseMcpServer } from '@mcp-abap-adt/lib/embeddable';
import { isUpdateOf } from '../../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../../src/lib/activeTools';
import { type SseStand, sseStand, turns, until } from './harness';

jest.setTimeout(30_000);

let s: SseStand;

beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  s = await sseStand();
});

afterEach(async () => {
  await s.close();
  jest.restoreAllMocks();
});

it('the closing connection is joined: one logoff, one let-go, exit 0 without the tool', async () => {
  const letGo = jest.spyOn(BaseMcpServer.prototype, 'letGoOfState');
  const connection = await s.open();
  const hold = s.standIn.hold((r) => isUpdateOf('A')(r.url));
  await connection.call('LockedUpdate', { id: 'A' }, 1);
  await hold.arrived;
  connection.close();
  await until(() => s.standIn.logoffs() === 1);
  s.processLike.emit('SIGTERM');
  expect(await s.exited).toBe(0);
  expect(activeTools().map((t) => t.name)).toEqual(['LockedUpdate']);
  await turns(20);
  expect(s.standIn.logoffs()).toBe(1);
  expect(letGo).toHaveBeenCalledTimes(1);
  hold.release();
  await until(() => activeTools().length === 0);
});
