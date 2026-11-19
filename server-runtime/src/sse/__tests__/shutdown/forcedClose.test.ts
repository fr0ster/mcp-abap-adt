/**
 * Tools that never settle, sse: one connection's tool
 * holds its request at the stand-in for ever, and another connection
 * already closed (its session logged off by its close). On `SIGTERM` (with
 * or without `--shutdown-timeout=1`) no second signal is needed: every owned
 * connection is logged off, once each, and the exit is `0` without waiting
 * for either tool.
 */

import assert from 'node:assert/strict';
import { afterEach, it, type Mock, mock } from 'node:test';
import { format } from 'node:util';
import { isUpdateOf } from '../../../../../src/__tests__/helpers/shutdownTools';
import { activeTools } from '../../../../../src/lib/activeTools';
import { ownedConnections } from '../../../../../src/lib/ownedConnections';
import { type SseStand, sseStand, turns, until } from './harness';

let s: SseStand;
let errorSpy: Mock<typeof console.error>;

afterEach(async () => {
  await s.close();
  errorSpy.mock.restore();
});

for (const [_name, shutdownTimeoutMs] of [
  ['no --shutdown-timeout', undefined],
  ['--shutdown-timeout=1', 1_000],
] satisfies [string, number | undefined][]) {
  it(
    format(
      '%s: every owned connection logged off once, exit 0 without the tools',
      _name,
    ),
    async (t) => {
      errorSpy = t.mock.method(console, 'error', () => {});
      s = await sseStand(
        shutdownTimeoutMs === undefined ? {} : { shutdownTimeoutMs },
      );
      const open = await s.open();
      const closing = await s.open();
      const holds = [
        s.standIn.hold((r) => isUpdateOf('A')(r.url)),
        s.standIn.hold((r) => isUpdateOf('B')(r.url)),
      ];
      await open.call('LockedUpdate', { id: 'A' }, 1);
      await closing.call('LockedUpdate', { id: 'B' }, 1);
      await until(
        () =>
          s.indexOf(isUpdateOf('A')) >= 0 && s.indexOf(isUpdateOf('B')) >= 0,
      );
      // The second connection closes: its session is logged off at once.
      closing.close();
      await until(() => s.standIn.logoffs() === 1);

      s.processLike.emit('SIGTERM');
      assert.equal(await s.exited, 0);
      assert.deepStrictEqual(s.stderr, []);
      assert.equal(activeTools().length, 2);
      assert.deepStrictEqual(ownedConnections(), []);
      await until(() => s.standIn.logoffs() === s.connects());
      await turns(20);
      assert.equal(s.standIn.logoffs(), 2);
      for (const hold of holds) hold.release();
      await until(() => activeTools().length === 0);
    },
  );
}
