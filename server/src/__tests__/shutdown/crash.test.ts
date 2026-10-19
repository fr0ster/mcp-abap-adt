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

import { isUnlockOf } from '../../../../src/__tests__/helpers/shutdownTools';
import {
  deferred,
  type Stand,
  stand,
  turns,
  until,
} from '../helpers/loginStand';

jest.setTimeout(30_000);

let s: Stand;

afterEach(async () => {
  await s.close();
});

const failedLine = (lines: string[]) =>
  lines.filter((l) => l.startsWith('[MCP] The process failed (TypeError)'));

it.each([
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
])(
  '%s: the orderly shutdown logs off the connection, one line, exit 1',
  async (_name, crash) => {
    s = await stand({ shutdown: {} });
    expect(await s.callTool('ProbeAdt', { id: 'p1' })).toMatchObject({
      isError: false,
    });
    crash(s, new TypeError('a secret-looking detail'));
    expect(await s.exited).toBe(1);
    await until(() => s.adt.logoffs() === 1);
    expect(failedLine(s.shutdownLines)).toHaveLength(1);
    expect(s.shutdownLines.join('\n')).not.toContain('secret-looking');
  },
);

it('a crash during a running shutdown lets it finish and exits 1; a second crash adds nothing', async () => {
  s = await stand({ shutdown: {} });
  // The session writes are held: the orderly shutdown is still running.
  const written = deferred<void>();
  const broker = await s.factory.getBroker('default');
  const flush = jest
    .spyOn(broker, 'flush')
    .mockImplementation(() => written.promise);
  const hold = s.adt.hold((r) => isUnlockOf('A')(r.url));
  void s.callTool('LockedUpdate', { id: 'A' });
  await hold.arrived;
  s.processLike.emit('SIGTERM');
  await until(() => s.adt.logoffs() === 1);
  await turns(20);
  expect(s.exits).toEqual([]);
  s.processLike.emit('uncaughtException', new TypeError('first'));
  s.processLike.emit('uncaughtException', new TypeError('second'));
  await turns(20);
  // Not forced: the sequence still waits for its session writes.
  expect(s.exits).toEqual([]);
  written.resolve();
  expect(await s.exited).toBe(1);
  await turns(20);
  expect(s.exits).toEqual([1]);
  // The logoff the shutdown wrote is joined, never sent again.
  expect(s.adt.logoffs()).toBe(1);
  expect(failedLine(s.shutdownLines)).toHaveLength(1);
  expect(
    s.shutdownLines.some((l) => l.includes('at the forced close')),
  ).toBe(false);
  hold.release();
  flush.mockRestore();
});
