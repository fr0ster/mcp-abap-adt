/**
 * The main flow does not hold the instance's end (core, stdio): a shutdown
 * that begins while one call holds the flow and another waits behind it
 * neither deadlocks nor leaves either call unanswered — the running call
 * runs to its end, the queued one after it (D55: a started call is never
 * aborted), and the process exits `0` with the session logged off.
 */

import { isLockOf, isUnlockOf } from '../../../src/__tests__/helpers/shutdownTools';
import { stand, until } from './helpers/loginStand';

jest.setTimeout(30_000);

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('SIGTERM with a call in the flow and one queued: both answer, the process exits 0', async () => {
  const s = await stand({ shutdown: {} });
  try {
    const held = s.adt.hold((r) => isLockOf('A')(r.url));
    const first = s.callTool('LockedUpdate', { id: 'A' });
    await held.arrived;
    const second = s.callTool('LockedUpdate', { id: 'B' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    // B waits behind A: nothing of it has reached SAP.
    expect(s.adt.requests.some((r) => isLockOf('B')(r.url))).toBe(false);

    s.processLike.emit('SIGTERM');
    held.release();
    expect(await first).toMatchObject({ isError: false });
    expect(await second).toMatchObject({ isError: false });
    expect(await s.exited).toBe(0);
    await until(() => s.adt.logoffs() === 1);

    const unlockA = s.adt.requests.findIndex((r) => isUnlockOf('A')(r.url));
    const lockB = s.adt.requests.findIndex((r) => isLockOf('B')(r.url));
    expect(unlockA).toBeGreaterThanOrEqual(0);
    expect(lockB).toBeGreaterThan(unlockA);
  } finally {
    await s.close();
  }
});
