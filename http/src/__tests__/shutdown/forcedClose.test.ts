/**
 * Tools that never settle, http (spec §6.4, §14.5): a tool on a pooled
 * instance (held state with a connection of its own) and one on a
 * per-request instance, each with its update held for ever. On `SIGTERM`
 * (with or without `--shutdown-timeout=1`) no second signal is needed: every
 * owned connection — the per-request instance's, the pooled instance's and
 * its held state's own — is logged off at once, the running tools are
 * interrupted and not awaited, no state undo is sent (the logoff ends the
 * state), and the exit is `0` before any timer could force it.
 */

import {
  isUpdateOf,
  stopUrl,
} from '../../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../../src/lib/activeTools';
import { ownedConnections } from '../../../../src/lib/ownedConnections';
import { type HttpStand, httpStand, until } from './harness';

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

describe.each([
  ['no --shutdown-timeout', undefined],
  ['--shutdown-timeout=1', 1_000],
])('%s', (_name, shutdownTimeoutMs) => {
  beforeEach(async () => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    s = await httpStand(
      shutdownTimeoutMs === undefined ? {} : { shutdownTimeoutMs },
    );
  });

  it('tools that never settle: every owned connection logged off at once, no undo, exit 0', async () => {
    const held = await s.call('HoldState', { id: 'P' });
    expect(held.isError).toBe(false);
    const holds = [
      s.standIn.hold((r) => isUpdateOf('P1')(r.url)),
      s.standIn.hold((r) => isUpdateOf('B1')(r.url)),
    ];
    void s
      .call('LockedUpdate', { id: 'P1', state_handle: held.text })
      .catch(() => undefined);
    void s.call('LockedUpdate', { id: 'B1' }).catch(() => undefined);
    await until(
      () =>
        s.standIn.requests.some((r) => isUpdateOf('P1')(r.url)) &&
        s.standIn.requests.some((r) => isUpdateOf('B1')(r.url)),
    );

    s.processLike.emit('SIGTERM');
    expect(await s.exited).toBe(0);
    expect(s.stderr).toEqual([]);
    expect(activeTools()).toHaveLength(2);
    expect(ownedConnections()).toEqual([]);
    // Every connection opened — the pooled instance's (one per request
    // credential), its state's own, the per-request one's — got its logoff.
    await until(() => s.standIn.logoffs() === connects());
    expect(s.standIn.logoffs()).toBeGreaterThanOrEqual(3);
    expect(s.standIn.requests.some((r) => r.url.startsWith(stopUrl('P')))).toBe(
      false,
    );
    for (const hold of holds) hold.release();
    await until(() => activeTools().length === 0);
  });
});
