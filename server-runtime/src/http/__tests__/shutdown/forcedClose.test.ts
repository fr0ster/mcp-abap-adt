/**
 * Tools that never settle, http: a tool on a pooled
 * instance (held state with a connection of its own) and one on a
 * per-request instance, each with its update held for ever. On `SIGTERM`
 * (with or without `--shutdown-timeout=1`) no second signal is needed: every
 * owned connection — the per-request instance's, the pooled instance's and
 * its held state's own — is logged off at once, the running tools are
 * interrupted and not awaited, no state undo is sent (the logoff ends the
 * state), and the exit is `0` before any timer could force it.
 */

import assert from 'node:assert/strict';
import {
  afterEach,
  beforeEach,
  describe,
  it,
  type Mock,
  mock,
} from 'node:test';
import { format } from 'node:util';
import {
  isUpdateOf,
  stopUrl,
} from '../../../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../../../src/lib/activeTools';
import { ownedConnections } from '../../../../../src/lib/ownedConnections';
import { type HttpStand, httpStand, until } from './harness';

let s: HttpStand;
let errorSpy: Mock<typeof console.error>;

afterEach(async () => {
  await s.close();
  errorSpy.mock.restore();
});

/** Connections opened at the stand-in: each connect reads the discovery once. */
const connects = () =>
  s.standIn.requests.filter((r) => r.url.includes('discovery')).length;

for (const [_name, shutdownTimeoutMs] of [
  ['no --shutdown-timeout', undefined],
  ['--shutdown-timeout=1', 1_000],
] satisfies [string, number | undefined][]) {
  describe(format('%s', _name), () => {
    beforeEach(async () => {
      errorSpy = mock.method(console, 'error', () => {});
      s = await httpStand(
        shutdownTimeoutMs === undefined ? {} : { shutdownTimeoutMs },
      );
    });

    it('tools that never settle: every owned connection logged off at once, no undo, exit 0', async () => {
      const held = await s.call('HoldState', { id: 'P' });
      assert.equal(held.isError, false);
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
      assert.equal(await s.exited, 0);
      assert.deepStrictEqual(s.stderr, []);
      assert.equal(activeTools().length, 2);
      assert.deepStrictEqual(ownedConnections(), []);
      // Every connection opened — the pooled instance's (one per request
      // credential), its state's own, the per-request one's — got its logoff.
      await until(() => s.standIn.logoffs() === connects());
      assert.ok(s.standIn.logoffs() >= 3);
      assert.equal(
        s.standIn.requests.some((r) => r.url.startsWith(stopUrl('P'))),
        false,
      );
      for (const hold of holds) hold.release();
      await until(() => activeTools().length === 0);
    });
  });
}
