/**
 * The forced close, core (spec §6.4): a `SIGTERM` / `SIGINT` after the start
 * exits at once naming what was pending; `--shutdown-timeout=1` ends a held
 * flush the same way. Exit codes, and one stderr line per fact.
 */

import { CLOSE_FAILED_WORDS, own } from '../../../../src/lib/ownedConnections';
import { deferred, runningTool, setup, turns } from './harness';

afterEach(() => {
  jest.useRealTimers();
});

it('a SIGTERM after the start exits 1 at once, naming the tool still running and the step', async () => {
  const s = setup();
  const tool = runningTool('UpdateClass');
  s.processLike.emit('SIGTERM');
  await turns();
  expect(s.exits).toEqual([]);
  s.processLike.emit('SIGTERM');
  await turns();
  expect(s.exits).toEqual([1]);
  expect(s.stderr).toEqual([
    '[MCP] Still running at the forced close: UpdateClass',
    '[MCP] Not finished at the forced close: the running tools',
  ]);
  // Nothing after the forced close: the instance close and the settle never ran.
  expect(s.order).toEqual(['begin', 'exit(1)']);
  tool.end();
  await turns();
  expect(s.exits).toEqual([1]);
});

it('a SIGINT after the start does the same', async () => {
  const s = setup();
  const tool = runningTool('UpdateClass');
  s.processLike.emit('SIGINT');
  await turns();
  s.processLike.emit('SIGINT');
  await turns();
  expect(s.exits).toEqual([1]);
  tool.end();
});

it('--shutdown-timeout=1 ends a held flush: exit 1 naming the session writes; the flush got the aborted signal', async () => {
  jest.useFakeTimers({
    doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
  });
  const write = deferred<{ notStored: string[] }>();
  const s = setup({ settle: () => write.promise, shutdownTimeoutMs: 1_000 });
  s.processLike.emit('SIGTERM');
  await turns();
  expect(s.order).toContain('settle');
  expect(s.exits).toEqual([]);
  jest.advanceTimersByTime(1_000);
  await turns();
  expect(s.exits).toEqual([1]);
  expect(s.stderr).toEqual([
    '[MCP] Not finished at the forced close: the session writes',
  ]);
  expect(s.settleSignal()?.aborted).toBe(true);
  write.resolve({ notStored: [] });
  await turns();
  expect(s.exits).toEqual([1]);
});

it('the forced close writes the logoff of every owned connection, and only once each', async () => {
  const s = setup();
  const tool = runningTool('UpdateClass');
  let disconnects = 0;
  const connection = {
    disconnect: async () => {
      disconnects += 1;
    },
  };
  own(connection, { role: 'built', owner: {} });
  s.processLike.emit('SIGTERM');
  await turns();
  s.processLike.emit('SIGTERM');
  s.processLike.emit('SIGTERM');
  await turns();
  expect(disconnects).toBe(1);
  expect(s.exits).toEqual([1]);
  expect(s.stderr).not.toContain(CLOSE_FAILED_WORDS);
  tool.end();
});
