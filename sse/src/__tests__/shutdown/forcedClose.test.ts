/**
 * The forced close with a tool that never settles, sse (spec §6.4, §14.5):
 * one connection's tool holds its request at the stand-in for ever, and
 * another connection already closed has its instance close running (waiting
 * for its own never-settling tool); `SIGTERM`, then a second `SIGTERM` (and
 * separately `--shutdown-timeout=1`): the stand-in received the logoff of
 * every owned connection, and the process exits `1` naming the requests.
 */

import { isUpdateOf } from '../../../../src/__tests__/helpers/shutdownTools';
import { ownedConnections } from '../../../../src/lib/ownedConnections';
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
  '%s: every owned connection logged off, exit 1 naming the requests',
  async (_name, shutdownTimeoutMs) => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    s = await sseStand(
      shutdownTimeoutMs === undefined ? {} : { shutdownTimeoutMs },
    );
    const open = await s.open();
    const closing = await s.open();
    s.standIn.hold((r) => isUpdateOf('A')(r.url));
    s.standIn.hold((r) => isUpdateOf('B')(r.url));
    await open.call('LockedUpdate', { id: 'A' }, 1);
    await closing.call('LockedUpdate', { id: 'B' }, 1);
    await until(
      () => s.indexOf(isUpdateOf('A')) >= 0 && s.indexOf(isUpdateOf('B')) >= 0,
    );
    // The second connection closes: its instance close runs and waits.
    closing.close();
    await turns(20);

    s.processLike.emit('SIGTERM');
    await turns(20);
    expect(s.exits).toEqual([]);
    if (shutdownTimeoutMs === undefined) s.processLike.emit('SIGTERM');
    expect(await s.exited).toBe(1);
    expect(s.stderr).toContain(
      '[MCP] Still running at the forced close: LockedUpdate (2 calls)',
    );
    expect(ownedConnections()).toEqual([]);
    await until(() => s.standIn.logoffs() === s.connects());
  },
);
