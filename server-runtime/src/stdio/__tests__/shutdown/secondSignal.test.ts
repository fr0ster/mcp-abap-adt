/**
 * The forced close, core: a `SIGTERM` / `SIGINT` after the start
 * — while the session writes are held — exits at once naming what was
 * pending; `--shutdown-timeout=1` ends a held flush the same way. Exit
 * codes, and one stderr line per fact.
 */

import assert from 'node:assert/strict';
import { afterEach, it, mock } from 'node:test';
import {
  useFakeTimers,
  useRealTimers,
} from '../../../../../src/__tests__/helpers/fakeTime';
import {
  CLOSE_FAILED_WORDS,
  own,
} from '../../../../../src/lib/ownedConnections';
import { deferred, runningTool, setup, turns } from './harness';

afterEach(() => {
  useRealTimers();
});

it('a SIGTERM after the start exits 1 at once, naming the tool still running and the step', async () => {
  const write = deferred<{ notStored: string[] }>();
  const s = setup({ settle: () => write.promise });
  const tool = runningTool('UpdateClass');
  s.processLike.emit('SIGTERM');
  await turns();
  assert.deepStrictEqual(s.exits, []);
  s.processLike.emit('SIGTERM');
  await turns();
  assert.deepStrictEqual(s.exits, [1]);
  // The tool was interrupted at the start, and has not settled yet.
  assert.deepStrictEqual(s.stderr, [
    '[MCP] Still running at the forced close: UpdateClass',
    '[MCP] Not finished at the forced close: the session writes',
  ]);
  assert.deepStrictEqual(s.order, ['begin', 'mcp close', 'settle', 'exit(1)']);
  tool.end();
  write.resolve({ notStored: [] });
  await turns();
  assert.deepStrictEqual(s.exits, [1]);
});

it('a SIGINT after the start does the same', async () => {
  const write = deferred<{ notStored: string[] }>();
  const s = setup({ settle: () => write.promise });
  const tool = runningTool('UpdateClass');
  s.processLike.emit('SIGINT');
  await turns();
  s.processLike.emit('SIGINT');
  await turns();
  assert.deepStrictEqual(s.exits, [1]);
  tool.end();
  write.resolve({ notStored: [] });
});

it('--shutdown-timeout=1 ends a held flush: exit 1 naming the session writes; the flush got the aborted signal', async () => {
  useFakeTimers({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const write = deferred<{ notStored: string[] }>();
  const s = setup({ settle: () => write.promise, shutdownTimeoutMs: 1_000 });
  s.processLike.emit('SIGTERM');
  await turns();
  assert.ok(s.order.includes('settle'));
  assert.deepStrictEqual(s.exits, []);
  mock.timers.tick(1_000);
  await turns();
  assert.deepStrictEqual(s.exits, [1]);
  assert.deepStrictEqual(s.stderr, [
    '[MCP] Not finished at the forced close: the session writes',
  ]);
  assert.equal(s.settleSignal()?.aborted, true);
  write.resolve({ notStored: [] });
  await turns();
  assert.deepStrictEqual(s.exits, [1]);
});

it('the logoffs and the forced close write the logoff of every owned connection only once each', async () => {
  const write = deferred<{ notStored: string[] }>();
  const s = setup({ settle: () => write.promise });
  const tool = runningTool('UpdateClass');
  let disconnects = 0;
  const connection = {
    disconnect: async () => {
      disconnects += 1;
    },
  };
  own(connection, { role: 'built', owner: {} });
  s.processLike.emit('SIGTERM');
  // Asked for in the trigger's tick: the logoffs at once.
  assert.equal(disconnects, 1);
  await turns();
  s.processLike.emit('SIGTERM');
  s.processLike.emit('SIGTERM');
  await turns();
  assert.equal(disconnects, 1);
  assert.deepStrictEqual(s.exits, [1]);
  assert.ok(!s.stderr.includes(CLOSE_FAILED_WORDS));
  tool.end();
  write.resolve({ notStored: [] });
});
