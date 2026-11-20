/**
 * A crash outside a tool, stdio: an `uncaughtException` (a
 * timer callback that throws) or an `unhandledRejection` (a promise
 * rejected with no handler) runs the orderly shutdown — the stand-in receives
 * the logoff of the instance's connection, one fixed-words stderr line names
 * the failure by its class, never its message, and the process exits `1`.
 * During a running shutdown (its session writes held) the crash lets it
 * finish and exit `1`; a second crash adds nothing, and the logoff is sent
 * once.
 *
 * The process's events arrive on the launcher's process edge (`processLike`)
 * as Node delivers them: a real throw here would end the test runner.
 */

import assert from 'node:assert/strict';
import { afterEach, it, mock } from 'node:test';
import { format } from 'node:util';
import { assertMatchObject } from '../../../../../src/__tests__/helpers/assertions';
import { isUnlockOf } from '../../../../../src/__tests__/helpers/shutdownTools';
import {
  deferred,
  type Stand,
  stand,
  turns,
  until,
} from '../helpers/loginStand';

let s: Stand;

afterEach(async () => {
  await s.close();
});

const failedLine = (lines: string[]) =>
  lines.filter((l) => l.startsWith('[MCP] The process failed (TypeError)'));

for (const [_name, crash] of [
  [
    'a timer callback that throws',
    (st: Stand, error: Error) =>
      setTimeout(() => st.processLike.emit('uncaughtException', error), 0),
  ],
  [
    'a promise rejected with no handler',
    (st: Stand, error: Error) =>
      setTimeout(
        () =>
          st.processLike.emit('unhandledRejection', error, Promise.resolve()),
        0,
      ),
  ],
] satisfies [string, (st: Stand, error: Error) => NodeJS.Timeout][]) {
  it(
    format(
      '%s: the orderly shutdown logs off the connection, one line, exit 1',
      _name,
    ),
    async () => {
      s = await stand({ kind: 'onprem', shutdown: {} });
      assertMatchObject(await s.callTool('ProbeAdt', { id: 'p1' }), {
        isError: false,
      });
      crash(s, new TypeError('a secret-looking detail'));
      assert.equal(await s.exited, 1);
      await until(() => s.adt.logoffs() === 1);
      assert.equal(failedLine(s.shutdownLines).length, 1);
      assert.ok(!s.shutdownLines.join('\n').includes('secret-looking'));
    },
  );
}

it('a crash during a running shutdown lets it finish and exits 1; a second crash adds nothing', async (t) => {
  s = await stand({ kind: 'onprem', shutdown: {} });
  // The session writes are held: the orderly shutdown is still running.
  const written = deferred<void>();
  const broker = await s.factory.getBroker('default');
  const flush = t.mock.method(broker, 'flush', () => written.promise);
  const hold = s.adt.hold((r) => isUnlockOf('A')(r.url));
  // Released whatever a check says: held writes and a held request keep
  // the stand's close, and with it the file's process, waiting.
  try {
    void s.callTool('LockedUpdate', { id: 'A' });
    await hold.arrived;
    s.processLike.emit('SIGTERM');
    await until(() => s.adt.logoffs() === 1);
    await turns(20);
    assert.deepStrictEqual(s.exits, []);
    s.processLike.emit('uncaughtException', new TypeError('first'));
    s.processLike.emit('uncaughtException', new TypeError('second'));
    await turns(20);
    // Not forced: the sequence still waits for its session writes.
    assert.deepStrictEqual(s.exits, []);
    written.resolve();
    assert.equal(await s.exited, 1);
    await turns(20);
    assert.deepStrictEqual(s.exits, [1]);
    // The logoff the shutdown wrote is joined, never sent again.
    assert.equal(s.adt.logoffs(), 1);
    assert.equal(failedLine(s.shutdownLines).length, 1);
    assert.equal(
      s.shutdownLines.some((l) => l.includes('at the forced close')),
      false,
    );
  } finally {
    written.resolve();
    hold.release();
    flush.mock.restore();
  }
});
