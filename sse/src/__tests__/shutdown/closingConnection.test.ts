/**
 * RF7 (spec §6.4, D51): a process shutdown meets an SSE connection that is
 * already closing — its tool holds the `UNLOCK` at the stand-in when
 * `SIGTERM` arrives. The shutdown joins that close: the instance close runs
 * once (one `shutdownState()`), the `UNLOCK` lands before exit, exit `0`.
 */

import { BaseMcpServer } from '@mcp-abap-adt/lib/embeddable';
import { isLogoff } from '../../../../src/__tests__/helpers/adtStandIn';
import { isUnlockOf } from '../../../../src/__tests__/helpers/shutdownTools';
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
  jest.restoreAllMocks();
});

it('the closing connection is joined: one shutdownState(), the UNLOCK before exit, exit 0', async () => {
  const shutdownState = jest.spyOn(BaseMcpServer.prototype, 'shutdownState');
  const connection = await s.open();
  const hold = s.standIn.hold((r) => isUnlockOf('A')(r.url));
  await connection.call('LockedUpdate', { id: 'A' }, 1);
  await hold.arrived;
  connection.close();
  await turns(20);
  s.processLike.emit('SIGTERM');
  await turns(20);
  expect(s.exits).toEqual([]);
  expect(shutdownState).not.toHaveBeenCalled();

  hold.release();
  expect(await s.exited).toBe(0);
  expect(shutdownState).toHaveBeenCalledTimes(1);
  const unlock = s.indexOf(isUnlockOf('A'));
  expect(unlock).toBeGreaterThan(0);
  await until(() => s.standIn.logoffs() === s.connects());
  expect(s.standIn.requests.findIndex((r) => isLogoff(r.url))).toBeGreaterThan(
    unlock,
  );
  errorSpy.mockRestore();
});
