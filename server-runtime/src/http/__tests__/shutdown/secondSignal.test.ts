/**
 * The second signal and `--shutdown-timeout`, http: the
 * shutdown waits for no tool, so with an `UNLOCK` held at the stand-in the
 * first `SIGTERM` already ends with the logoff written and exit `0`; a
 * second signal after it changes nothing, and a `--shutdown-timeout` never
 * fires. (The forced close while a logoff is still being written: lib's
 * transport-shutdown suite.) Without `--shutdown-timeout` no timer is
 * pending (fake time).
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, it, mock } from 'node:test';
import { installTransportShutdown } from '@mcp-abap-adt/lib/http-transport';
import {
  getTimerCount,
  useFakeTimers,
  useRealTimers,
} from '../../../../../src/__tests__/helpers/fakeTime';
import { isUnlockOf } from '../../../../../src/__tests__/helpers/shutdownTools';
import {
  registerActiveTool,
  resetProcessLatchForTests,
} from '../../../../../src/lib/activeTools';
import { type HttpStand, httpStand, turns, until } from './harness';

let s: HttpStand | undefined;
let restoreError: () => void;

beforeEach(() => {
  const errorSpy = mock.method(console, 'error', () => {});
  restoreError = () => errorSpy.mock.restore();
});

afterEach(async () => {
  await s?.close();
  s = undefined;
  restoreError();
});

/**
 * Releases a held UNLOCK and lets it settle before the case ends — also when
 * the case failed: its answer written whole, then read by the server's client
 * within real turns. Left in flight, the answer landed in a later case under
 * fake timers, and its request's real timeout was cleared through the faked
 * clearTimeout — kept alive for ten minutes, the file's process did not exit
 * (Task 4 report, "secondSignal: socket owner"). A hold whose request never
 * arrived has nothing to settle.
 */
async function settleHeld(hold: ReturnType<HttpStand['standIn']['hold']>) {
  let arrived = false;
  void hold.arrived.then(() => {
    arrived = true;
  });
  await turns(1);
  hold.release();
  if (arrived) await hold.answered;
  await turns(20);
}

it('a second SIGTERM after the logoffs changes nothing: one exit, one logoff', async () => {
  s = await httpStand();
  const stand = s;
  const hold = stand.standIn.hold((r) => isUnlockOf('A')(r.url));
  try {
    void stand.call('LockedUpdate', { id: 'A' }).catch(() => undefined);
    await hold.arrived;
    stand.processLike.emit('SIGTERM');
    assert.equal(await stand.exited, 0);
    stand.processLike.emit('SIGTERM');
    await turns(20);
    assert.deepStrictEqual(stand.exits, [0]);
    await until(() => stand.standIn.logoffs() === 1);
    await turns(20);
    assert.equal(stand.standIn.logoffs(), 1);
  } finally {
    await settleHeld(hold);
  }
});

it('--shutdown-timeout=1: the logoffs end the sequence first, exit 0', async () => {
  s = await httpStand({ shutdownTimeoutMs: 1_000 });
  const stand = s;
  const hold = stand.standIn.hold((r) => isUnlockOf('A')(r.url));
  try {
    void stand.call('LockedUpdate', { id: 'A' }).catch(() => undefined);
    await hold.arrived;
    stand.processLike.emit('SIGTERM');
    assert.equal(await stand.exited, 0);
    await new Promise((r) => setTimeout(r, 1_200));
    assert.deepStrictEqual(stand.exits, [0]);
    await until(() => stand.standIn.logoffs() === 1);
  } finally {
    await settleHeld(hold);
  }
});

it('without a second signal or --shutdown-timeout no timer is pending (fake time)', async () => {
  resetProcessLatchForTests();
  useFakeTimers({ apis: ['setTimeout', 'setInterval', 'Date'] });
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
    assert.equal(getTimerCount(), 0);
    // The running tool is not awaited.
    assert.deepStrictEqual(exits, [0]);
    remove?.();
  } finally {
    useRealTimers();
  }
});
