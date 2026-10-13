/**
 * The forced close with a tool that never settles, http (spec §6.4, §14.5):
 * a tool whose request the stand-in holds for ever; `SIGTERM`, then a second
 * `SIGTERM` (and separately `--shutdown-timeout=1`): the stand-in received
 * the logoff of every owned connection — a per-request instance's and a
 * pooled instance's, its held state's own included — and the process exits
 * `1` naming the request. And with the pool's drain itself still waiting (a
 * state undo held for ever), the forced close does not wait for it.
 */

import { isLogoff } from '../../../../src/__tests__/helpers/adtStandIn';
import {
  isUpdateOf,
  stopUrl,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { ownedConnections } from '../../../../src/lib/ownedConnections';
import { type HttpStand, httpStand, turns, until } from './harness';

jest.setTimeout(30_000);

let s: HttpStand;
let errorSpy: jest.SpyInstance;

afterEach(async () => {
  await s.close();
  errorSpy.mockRestore();
});

/** Connections opened at the stand-in: each connect reads the discovery once. */
const connects = () =>
  s.standIn.requests.filter((r) => r.url.includes('discovery')).length;

async function neverSettling() {
  // A pooled instance: held state with a connection of its own.
  const held = await s.call('HoldState', { id: 'P' });
  expect(held.isError).toBe(false);
  // A tool on the pooled instance and one on a per-request instance, each
  // with its update held for ever.
  s.standIn.hold((r) => isUpdateOf('P1')(r.url));
  s.standIn.hold((r) => isUpdateOf('B1')(r.url));
  void s
    .call('LockedUpdate', { id: 'P1', state_handle: held.text })
    .catch(() => undefined);
  void s.call('LockedUpdate', { id: 'B1' }).catch(() => undefined);
  await until(
    () =>
      s.standIn.requests.some((r) => isUpdateOf('P1')(r.url)) &&
      s.standIn.requests.some((r) => isUpdateOf('B1')(r.url)),
  );
}

describe.each([
  ['a second SIGTERM', undefined],
  ['--shutdown-timeout=1', 1_000],
])('%s', (_name, shutdownTimeoutMs) => {
  beforeEach(async () => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    s = await httpStand(
      shutdownTimeoutMs === undefined ? {} : { shutdownTimeoutMs },
    );
  });

  it('tools that never settle: every owned connection logged off, exit 1 naming the request', async () => {
    await neverSettling();
    s.processLike.emit('SIGTERM');
    await turns(20);
    expect(s.exits).toEqual([]);
    if (shutdownTimeoutMs === undefined) s.processLike.emit('SIGTERM');
    expect(await s.exited).toBe(1);
    expect(s.stderr).toContain(
      '[MCP] Still running at the forced close: LockedUpdate (2 calls)',
    );
    expect(ownedConnections()).toEqual([]);
    await until(() => s.standIn.logoffs() === connects());
  });

  it("the pool's drain still waiting (a state undo held for ever) is not waited for", async () => {
    const held = await s.call('HoldState', { id: 'Q' });
    expect(held.isError).toBe(false);
    s.standIn.hold((r) => r.url.startsWith(stopUrl('Q')));
    s.processLike.emit('SIGTERM');
    await until(() =>
      s.standIn.requests.some((r) => r.url.startsWith(stopUrl('Q'))),
    );
    expect(s.exits).toEqual([]);
    if (shutdownTimeoutMs === undefined) s.processLike.emit('SIGTERM');
    expect(await s.exited).toBe(1);
    expect(s.stderr).toEqual([
      '[MCP] Not finished at the forced close: closing the instances',
    ]);
    expect(ownedConnections()).toEqual([]);
    await until(() => s.standIn.logoffs() === connects());
    expect(s.standIn.requests.some((r) => isLogoff(r.url))).toBe(true);
  });
});
