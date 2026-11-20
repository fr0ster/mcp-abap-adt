/**
 * The main flow does not hold the instance's end (core, stdio): a shutdown
 * that begins while one call holds the flow and another waits behind it
 * does not deadlock — the session is logged off at once under the running
 * call, the queued one leaves the flow without sending, and the process
 * exits `0` without waiting for either.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import {
  isLockOf,
  isUnlockOf,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { stand, until } from './helpers/loginStand';

beforeEach(() => {
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

it('SIGTERM with a call in the flow and one queued: the logoff at once, the queued call never sends, exit 0', async () => {
  const s = await stand({ kind: 'onprem', shutdown: {} });
  try {
    const held = s.adt.hold((r) => isLockOf('A')(r.url));
    void s.callTool('LockedUpdate', { id: 'A' });
    await held.arrived;
    void s.callTool('LockedUpdate', { id: 'B' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    // B waits behind A: nothing of it has reached SAP.
    assert.equal(
      s.adt.requests.some((r) => isLockOf('B')(r.url)),
      false,
    );

    s.processLike.emit('SIGTERM');
    assert.equal(await s.exited, 0);
    await until(() => s.adt.logoffs() === 1);
    held.release();
    await until(() => s.active() === 0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(
      s.adt.requests.some((r) => isLockOf('B')(r.url)),
      false,
    );
    assert.equal(
      s.adt.requests.some((r) => isUnlockOf('A')(r.url)),
      false,
    );
  } finally {
    await s.close();
  }
});
