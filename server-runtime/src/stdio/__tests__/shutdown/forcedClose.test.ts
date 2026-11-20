/**
 * The forced close, core: the logoffs went out at the
 * start — a tool's update held at the stand-in for ever, interrupted, its
 * connections logged off — and the session writes are held; then a second
 * `SIGTERM` (and separately `--shutdown-timeout=1`): no further wait, every
 * owned connection logged off once — the instance's own and its held
 * state's — and the process exits `1` naming the tool still running and the
 * step it cut short.
 *
 * The shutdown timeout's timer is the test's to fire, not the clock's: the
 * timer the shutdown sets with the timeout's delay is taken (the real
 * `setTimeout` answers every other call), and the test fires it once it has
 * seen that nothing exited before it. On real time a slow runner let the
 * timeout fire before that check (CI, ubuntu / Node 24, measured once).
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import { format } from 'node:util';
import { assertMatchObject } from '../../../../../src/__tests__/helpers/assertions';
import { isUpdateOf } from '../../../../../src/__tests__/helpers/shutdownTools';
import { ownedConnections } from '../../../../../src/lib/ownedConnections';
import {
  type Deferred,
  deferred,
  type Stand,
  stand,
  turns,
  until,
} from '../helpers/loginStand';

let s: Stand;
let written: Deferred<void>;

beforeEach(() => {
  written = deferred<void>();
});

afterEach(async () => {
  written.resolve();
  mock.restoreAll();
  await s.close();
});

for (const [_name, timeoutMs] of [
  ['a second SIGTERM', undefined],
  ['--shutdown-timeout=1', 1_000],
] satisfies [string, number | undefined][]) {
  it(
    format(
      '%s: every owned connection logged off once, exit 1 naming the request and the step',
      _name,
    ),
    async (t) => {
      s = await stand({
        kind: 'onprem',
        shutdown: timeoutMs === undefined ? {} : { timeoutMs },
      });
      assertMatchObject(await s.callTool('HoldState', { id: 'S' }), {
        isError: false,
      });
      // The session writes never finish on their own.
      const broker = await s.factory.getBroker('default');
      t.mock.method(broker, 'flush', () => written.promise);
      s.adt.hold((r) => isUpdateOf('A')(r.url));
      void s.callTool('LockedUpdate', { id: 'A' });
      await until(() => s.adt.requests.some((r) => isUpdateOf('A')(r.url)));

      // The shutdown's own timer, taken when it is set, fired by the test.
      let fire: (() => void) | undefined;
      if (timeoutMs !== undefined) {
        const real = globalThis.setTimeout;
        const timers = t.mock.method(
          globalThis,
          'setTimeout',
          (callback: () => void, ms?: number) => {
            if (ms !== timeoutMs || fire !== undefined)
              return real(callback, ms);
            fire = () => callback();
            timers.mock.restore();
            // A handle the shutdown may clear; it fires nothing of its own.
            return real(() => undefined, 0);
          },
        );
      }
      s.processLike.emit('SIGTERM');
      await until(() => s.adt.logoffs() === 2);
      await turns(20);
      assert.deepStrictEqual(s.exits, []);
      if (timeoutMs === undefined) s.processLike.emit('SIGTERM');
      else {
        assert.notEqual(fire, undefined);
        fire?.();
      }
      assert.equal(await s.exited, 1);
      assert.deepStrictEqual(s.shutdownLines, [
        '[MCP] Still running at the forced close: LockedUpdate',
        '[MCP] Not finished at the forced close: the session writes',
      ]);
      assert.deepStrictEqual(ownedConnections(), []);
      const connects = () =>
        s.adt.requests.filter((r) => r.url.includes('discovery')).length;
      // The instance's connection and the state's own: two logoffs, once each.
      assert.equal(s.adt.logoffs(), connects());
      assert.equal(s.adt.logoffs(), 2);
    },
  );
}
