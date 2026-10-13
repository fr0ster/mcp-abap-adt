/**
 * The second-signal escape, sse (spec §6.4, §14.5): the `UNLOCK` held, a
 * second `SIGTERM` exits `1` at once naming the request, and the session's
 * logoff is still sent; `--shutdown-timeout=1` the same.
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
  '%s: exit 1 at once naming the request; the logoff is still sent',
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
    await turns(20);
    expect(s.exits).toEqual([]);
    if (shutdownTimeoutMs === undefined) s.processLike.emit('SIGTERM');
    expect(await s.exited).toBe(1);
    expect(s.stderr).toContain(
      '[MCP] Still running at the forced close: LockedUpdate',
    );
    await until(() => s.standIn.logoffs() === 1);
    hold.release();
  },
);
