/**
 * The forced close with a tool that never settles, core (spec §6.4,
 * §14.5): a tool whose request the stand-in holds for ever; `SIGTERM`, then a
 * second `SIGTERM` (and separately `--shutdown-timeout=1`): the stand-in
 * received the logoff of every owned connection — the instance's own and
 * its held state's — and the process exits `1` naming the request.
 */

import { isUpdateOf } from '../../../../src/__tests__/helpers/shutdownTools';
import { ownedConnections } from '../../../../src/lib/ownedConnections';
import { type Stand, stand, turns, until } from '../helpers/loginStand';

jest.setTimeout(30_000);

let s: Stand;

afterEach(async () => {
  await s.close();
});

it.each([
  ['a second SIGTERM', undefined],
  ['--shutdown-timeout=1', 1_000],
])(
  '%s: every owned connection logged off, exit 1 naming the request',
  async (_name, timeoutMs) => {
    s = await stand({
      shutdown: timeoutMs === undefined ? {} : { timeoutMs },
    });
    expect(await s.callTool('HoldState', { id: 'S' })).toMatchObject({
      isError: false,
    });
    s.adt.hold((r) => isUpdateOf('A')(r.url));
    void s.callTool('LockedUpdate', { id: 'A' });
    await until(() => s.adt.requests.some((r) => isUpdateOf('A')(r.url)));

    s.processLike.emit('SIGTERM');
    await turns(20);
    expect(s.exits).toEqual([]);
    if (timeoutMs === undefined) s.processLike.emit('SIGTERM');
    expect(await s.exited).toBe(1);
    expect(s.shutdownLines).toEqual([
      '[MCP] Still running at the forced close: LockedUpdate',
      '[MCP] Not finished at the forced close: the running tools',
    ]);
    expect(ownedConnections()).toEqual([]);
    const connects = () =>
      s.adt.requests.filter((r) => r.url.includes('discovery')).length;
    // The instance's connection and the state's own: two logoffs.
    await until(() => s.adt.logoffs() === connects());
    expect(s.adt.logoffs()).toBe(2);
  },
);
