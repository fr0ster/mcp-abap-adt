/**
 * The HTTP-transport shutdown (spec §3.7, §6.4, D50): one sequence for http
 * and sse — the latch and the transport's `begin` in the trigger's tick,
 * stop listening, await every registered tool (none aborted), the last step,
 * exit `0` or `1` with its lines. No deadline: a later signal or
 * `--shutdown-timeout` forces — the last step is not awaited.
 */

import { EventEmitter } from 'node:events';
import {
  isLatched,
  registerActiveTool,
  resetProcessLatchForTests,
} from '../../../lib/activeTools';
import { installTransportShutdown } from '../../../lib/httpTransport/shutdown';

const turns = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

function setup(lastStep: () => Promise<string[]> = async () => []) {
  resetProcessLatchForTests();
  const order: string[] = [];
  const exits: number[] = [];
  const stderr: string[] = [];
  const processLike = new EventEmitter();
  installTransportShutdown({
    begin: () => order.push(`begin latched=${isLatched()}`),
    stopListening: () => order.push('stop listening'),
    lastStep: async () => {
      order.push('last step');
      return lastStep();
    },
    exit: (code) => {
      order.push(`exit(${code})`);
      exits.push(code);
    },
    stderr: (line) => stderr.push(line),
    processLike,
  });
  return { order, exits, stderr, processLike };
}

it('SIGTERM: latch and begin in its tick, stop listening, the tools settle, the last step, exit 0', async () => {
  const s = setup();
  const tool = registerActiveTool(new AbortController(), {
    name: 'UpdateClass',
  });
  s.processLike.emit('SIGTERM');
  expect(s.order).toEqual(['begin latched=true', 'stop listening']);
  await turns();
  expect(s.order).toEqual(['begin latched=true', 'stop listening']);
  tool?.();
  await turns();
  expect(s.order).toEqual([
    'begin latched=true',
    'stop listening',
    'last step',
    'exit(0)',
  ]);
});

it("the last step's leftovers: one line each, exit 1", async () => {
  const s = setup(async () => ['[MCP] left a', '[MCP] left b']);
  s.processLike.emit('SIGINT');
  await turns();
  expect(s.stderr).toEqual(['[MCP] left a', '[MCP] left b']);
  expect(s.exits).toEqual([1]);
});

it('a second signal while the last step runs: not awaited, exit 1 naming the step', async () => {
  let release!: () => void;
  const held = new Promise<string[]>((r) => {
    release = () => r([]);
  });
  const s = setup(() => held);
  s.processLike.emit('SIGTERM');
  await turns();
  expect(s.order).toContain('last step');
  s.processLike.emit('SIGTERM');
  await turns();
  expect(s.exits).toEqual([1]);
  expect(s.stderr).toEqual([
    '[MCP] Not finished at the forced close: closing the instances',
  ]);
  release();
  await turns();
  expect(s.exits).toEqual([1]);
});
