/**
 * The HTTP-transport shutdown: one sequence for http
 * and sse — the latch and the transport's `begin` in the trigger's tick,
 * stop listening, then the logoffs at once: every connection the process
 * owns logged off and every running call interrupted, in one tick; no
 * running tool awaited; then `release`, exit `0`. A later signal while a
 * logoff is still being written forces: exit `1` naming the step.
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { it } from 'node:test';
import {
  isLatched,
  registerActiveTool,
  resetProcessLatchForTests,
} from '../../../lib/activeTools';
import { installTransportShutdown } from '../../../lib/httpTransport/shutdown';
import { own } from '../../../lib/ownedConnections';

const turns = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

function setup() {
  resetProcessLatchForTests();
  const order: string[] = [];
  const exits: number[] = [];
  const stderr: string[] = [];
  const processLike = new EventEmitter();
  installTransportShutdown({
    begin: () => order.push(`begin latched=${isLatched()}`),
    stopListening: () => order.push('stop listening'),
    release: () => order.push('release'),
    exit: (code) => {
      order.push(`exit(${code})`);
      exits.push(code);
    },
    stderr: (line) => stderr.push(line),
    processLike,
  });
  return { order, exits, stderr, processLike };
}

it('SIGTERM: latch and begin in its tick, stop listening, the logoffs at once with the tools interrupted, release, exit 0 — the running tool not awaited', async () => {
  const s = setup();
  const controller = new AbortController();
  const tool = registerActiveTool(controller, { name: 'UpdateClass' });
  own(
    {
      disconnect: async () => {
        s.order.push('logoff');
      },
    },
    { owner: {}, role: 'built' },
  );
  s.processLike.emit('SIGTERM');
  // The logoff is asked for in the trigger's tick, the interruption beside it.
  assert.deepStrictEqual(s.order, [
    'begin latched=true',
    'stop listening',
    'logoff',
  ]);
  assert.equal(controller.signal.aborted, true);
  await turns();
  // The tool never settled: the exit does not wait for it.
  assert.deepStrictEqual(s.order, [
    'begin latched=true',
    'stop listening',
    'logoff',
    'release',
    'exit(0)',
  ]);
  tool?.();
});

it('a second signal while a logoff is still being written: exit 1 naming the step', async () => {
  const s = setup();
  let written!: () => void;
  own(
    {
      disconnect: () =>
        new Promise<void>((r) => {
          written = r;
        }),
    },
    { owner: {}, role: 'built' },
  );
  s.processLike.emit('SIGTERM');
  await turns();
  assert.deepStrictEqual(s.exits, []);
  s.processLike.emit('SIGTERM');
  await turns();
  assert.deepStrictEqual(s.exits, []);
  // The forced close joins the logoff under way: exit once it is written.
  written();
  await turns();
  assert.deepStrictEqual(s.exits, [1]);
  assert.deepStrictEqual(s.stderr, [
    '[MCP] Not finished at the forced close: the logoffs',
  ]);
});
