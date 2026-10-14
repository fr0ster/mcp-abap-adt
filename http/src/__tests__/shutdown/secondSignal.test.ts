/**
 * The second signal and `--shutdown-timeout`, http (spec §6.4, §14.5): the
 * shutdown waits for no tool, so with an `UNLOCK` held at the stand-in the
 * first `SIGTERM` already ends with the logoff written and exit `0`; a
 * second signal after it changes nothing, and a `--shutdown-timeout` never
 * fires. (The forced close while a logoff is still being written: lib's
 * transport-shutdown suite.) Without `--shutdown-timeout` no timer is
 * pending (fake time).
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

it('a second SIGTERM after the logoffs changes nothing: one exit, one logoff', async () => {
  s = await httpStand();
  const stand = s;
  const hold = stand.standIn.hold((r) => isUnlockOf('A')(r.url));
  void stand.call('LockedUpdate', { id: 'A' }).catch(() => undefined);
  await hold.arrived;
  stand.processLike.emit('SIGTERM');
  expect(await stand.exited).toBe(0);
  stand.processLike.emit('SIGTERM');
  await turns(20);
  expect(stand.exits).toEqual([0]);
  await until(() => stand.standIn.logoffs() === 1);
  await turns(20);
  expect(stand.standIn.logoffs()).toBe(1);
  hold.release();
});

it('--shutdown-timeout=1: the logoffs end the sequence first, exit 0', async () => {
  s = await httpStand({ shutdownTimeoutMs: 1_000 });
  const stand = s;
  const hold = stand.standIn.hold((r) => isUnlockOf('A')(r.url));
  void stand.call('LockedUpdate', { id: 'A' }).catch(() => undefined);
  await hold.arrived;
  stand.processLike.emit('SIGTERM');
  expect(await stand.exited).toBe(0);
  await new Promise((r) => setTimeout(r, 1_200));
  expect(stand.exits).toEqual([0]);
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
      release: () => {},
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
    // The running tool is not awaited.
    expect(exits).toEqual([0]);
    remove?.();
  } finally {
    jest.useRealTimers();
  }
});
