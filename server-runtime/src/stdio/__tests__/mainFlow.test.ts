/**
 * The main flow does not hold the instance's end (core, stdio): a shutdown
 * that begins while one call holds the flow and another waits behind it
 * does not deadlock — the session is logged off at once under the running
 * call, the queued one leaves the flow without sending, and the process
 * exits `0` without waiting for either.
 */

import {
  isLockOf,
  isUnlockOf,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { stand, until } from './helpers/loginStand';

jest.setTimeout(30_000);

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('SIGTERM with a call in the flow and one queued: the logoff at once, the queued call never sends, exit 0', async () => {
  const s = await stand({ shutdown: {} });
  try {
    const held = s.adt.hold((r) => isLockOf('A')(r.url));
    void s.callTool('LockedUpdate', { id: 'A' });
    await held.arrived;
    void s.callTool('LockedUpdate', { id: 'B' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    // B waits behind A: nothing of it has reached SAP.
    expect(s.adt.requests.some((r) => isLockOf('B')(r.url))).toBe(false);

    s.processLike.emit('SIGTERM');
    expect(await s.exited).toBe(0);
    await until(() => s.adt.logoffs() === 1);
    held.release();
    await until(() => s.active() === 0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(s.adt.requests.some((r) => isLockOf('B')(r.url))).toBe(false);
    expect(s.adt.requests.some((r) => isUnlockOf('A')(r.url))).toBe(false);
  } finally {
    await s.close();
  }
});
