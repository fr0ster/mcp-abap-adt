/**
 * The second signal, sse: the shutdown waits for no
 * tool, so with an `UNLOCK` held at the stand-in the first `SIGTERM` already
 * ends with the logoff written and exit `0`; a second signal after it, or a
 * `--shutdown-timeout=1`, changes nothing — one exit, one logoff. (The
 * forced close while a logoff is still being written: lib's
 * transport-shutdown suite.)
 */

import { isUnlockOf } from '../../../../src/__tests__/helpers/shutdownTools';
import { type SseStand, sseStand, turns, until } from './harness';

jest.setTimeout(30_000);

let s: SseStand;
let errorSpy: jest.SpyInstance;

afterEach(async () => {
  await s.close();
  errorSpy.mockRestore();
});

it.each([
  ['a second SIGTERM', undefined],
  ['--shutdown-timeout=1', 1_000],
])(
  '%s after the logoffs: one exit 0, one logoff',
  async (_name, shutdownTimeoutMs) => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    s = await sseStand(
      shutdownTimeoutMs === undefined ? {} : { shutdownTimeoutMs },
    );
    const connection = await s.open();
    const hold = s.standIn.hold((r) => isUnlockOf('A')(r.url));
    await connection.call('LockedUpdate', { id: 'A' }, 1);
    await hold.arrived;
    s.processLike.emit('SIGTERM');
    expect(await s.exited).toBe(0);
    if (shutdownTimeoutMs === undefined) s.processLike.emit('SIGTERM');
    else await new Promise((r) => setTimeout(r, 1_200));
    await turns(20);
    expect(s.exits).toEqual([0]);
    await until(() => s.standIn.logoffs() === 1);
    await turns(20);
    expect(s.standIn.logoffs()).toBe(1);
    hold.release();
  },
);
