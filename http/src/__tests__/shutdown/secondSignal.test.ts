/**
 * The second-signal escape, http (spec §6.4, §14.5): the `UNLOCK` held at
 * the stand-in, a second `SIGTERM` exits `1` at once naming the request;
 * `--shutdown-timeout=1` ends the wait the same way; in both the session's
 * logoff is still sent. Without either, no timer is pending (fake time).
 */

import { EventEmitter } from 'node:events';
import { installTransportShutdown } from '@mcp-abap-adt/lib/http-transport';
import { isUnlockOf } from '../../../../src/__tests__/helpers/shutdownTools';
import {
  registerActiveTool,
  resetProcessLatchForTests,
} from '../../../../src/lib/activeTools';
import { type HttpStand, httpStand, turns, until } from './harness';

jest.setTimeout(30_000);

let s: HttpStand | undefined;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  await s?.close();
  s = undefined;
  errorSpy.mockRestore();
});

it('a second SIGTERM while the UNLOCK is held exits 1 at once naming the request; the logoff is still sent', async () => {
  s = await httpStand();
  const stand = s;
  const hold = stand.standIn.hold((r) => isUnlockOf('A')(r.url));
  void stand.call('LockedUpdate', { id: 'A' }).catch(() => undefined);
  await hold.arrived;
  stand.processLike.emit('SIGTERM');
  await turns(20);
  expect(stand.exits).toEqual([]);
  stand.processLike.emit('SIGTERM');
  expect(await stand.exited).toBe(1);
  expect(stand.stderr).toContain(
    '[MCP] Still running at the forced close: LockedUpdate',
  );
  await until(() => stand.standIn.logoffs() === 1);
  hold.release();
});

it('--shutdown-timeout=1 ends the wait the same way', async () => {
  s = await httpStand({ shutdownTimeoutMs: 1_000 });
  const stand = s;
  const hold = stand.standIn.hold((r) => isUnlockOf('A')(r.url));
  void stand.call('LockedUpdate', { id: 'A' }).catch(() => undefined);
  await hold.arrived;
  stand.processLike.emit('SIGTERM');
  expect(await stand.exited).toBe(1);
  expect(stand.stderr).toContain(
    '[MCP] Still running at the forced close: LockedUpdate',
  );
  await until(() => stand.standIn.logoffs() === 1);
  hold.release();
});

it('without a second signal or --shutdown-timeout no timer is pending (fake time)', async () => {
  resetProcessLatchForTests();
  jest.useFakeTimers({
    doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
  });
  try {
    const processLike = new EventEmitter();
    const exits: number[] = [];
    installTransportShutdown({
      stopListening: () => {},
      lastStep: async () => [],
      exit: (code) => exits.push(code),
      stderr: () => {},
      processLike,
    });
    const remove = registerActiveTool(new AbortController(), {
      name: 'LockedUpdate',
    });
    processLike.emit('SIGTERM');
    await turns();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(24 * 60 * 60_000);
    await turns();
    expect(exits).toEqual([]);
    remove?.();
    await turns();
    expect(exits).toEqual([0]);
  } finally {
    jest.useRealTimers();
  }
});
