/**
 * The program's shutdown, stdio (spec §6.4, D33): every trigger runs one
 * sequence — the latch, the tools settle, the instance close, then the
 * factory's settle (gate, logins, drain, flush), then the exit code — once,
 * and nothing of it reaches stdout.
 */

import { isLatched } from '../../../src/lib/activeTools';
import { installShutdown } from '../shutdown.js';
import {
  deferred,
  fakeProcess,
  runningTool,
  setup,
  turns,
} from './shutdown/harness';

describe('installShutdown (core)', () => {
  let stdout: jest.SpyInstance;
  beforeEach(() => {
    stdout = jest.spyOn(process.stdout, 'write');
  });
  afterEach(() => {
    // Nothing of the shutdown reaches stdout, in any case (H3).
    expect(stdout).not.toHaveBeenCalled();
    stdout.mockRestore();
  });

  it.each([
    ['SIGTERM', (p: ReturnType<typeof fakeProcess>) => p.emit('SIGTERM')],
    ['SIGINT', (p: ReturnType<typeof fakeProcess>) => p.emit('SIGINT')],
    ['stdin end', (p: ReturnType<typeof fakeProcess>) => p.stdin.emit('end')],
    [
      'stdin close',
      (p: ReturnType<typeof fakeProcess>) => p.stdin.emit('close'),
    ],
  ])(
    '%s runs the sequence: latch and begin in its tick, the instance close, then settle, exit 0',
    async (_name, trigger) => {
      const s = setup();
      trigger(s.processLike);
      // In the trigger's tick: the latch and the factory's begin.
      expect(isLatched()).toBe(true);
      expect(s.order).toEqual(['begin']);
      await turns();
      expect(s.order).toEqual([
        'begin',
        'undo',
        'mcp close',
        'settle',
        'settled',
        'exit(0)',
      ]);
      expect(s.stderr).toEqual([]);
    },
  );

  it('stdin end is not a trigger when not asked for', async () => {
    const s = setup({ onStdinEnd: false });
    s.processLike.stdin.emit('end');
    await turns();
    expect(s.order).toEqual([]);
  });

  it('the instance close and the settle wait for every registered tool, none aborted', async () => {
    const s = setup();
    const tool = runningTool();
    s.processLike.emit('SIGTERM');
    await turns();
    expect(s.order).toEqual(['begin']);
    tool.end();
    await turns();
    expect(s.order).toEqual([
      'begin',
      'undo',
      'mcp close',
      'settle',
      'settled',
      'exit(0)',
    ]);
  });

  it('a state undo that left something: one line, the settle still runs, exit 1', async () => {
    const s = setup({ shutdownState: async () => ['a debuggee was left'] });
    await s.run();
    expect(s.order).toContain('settle');
    expect(s.stderr).toEqual([
      '[MCP] State not undone at shutdown: a debuggee was left',
    ]);
    expect(s.exits).toEqual([1]);
  });

  it('notStored: one stderr line per destination, exit 1', async () => {
    const s = setup({
      settle: async () => ({
        notStored: ['"X": StorageError', '"Y": StorageError'],
      }),
    });
    await s.run();
    expect(s.stderr).toEqual([
      '[MCP] Session secrets not stored: "X": StorageError',
      '[MCP] Session secrets not stored: "Y": StorageError',
    ]);
    expect(s.exits).toEqual([1]);
  });

  it('a settle that throws: its class on stderr, exit 1', async () => {
    const stderr: string[] = [];
    const exits: number[] = [];
    class FlushTrouble extends Error {}
    const run = installShutdown({
      factory: {
        beginShutdown: () => {},
        settle: async () => {
          throw new FlushTrouble('a token, perhaps');
        },
      },
      instance: { shutdownState: async () => [], close: async () => {} },
      exit: (code) => exits.push(code),
      stderr: (line) => stderr.push(line),
      processLike: fakeProcess(),
    });
    await run();
    expect(stderr).toEqual(['[MCP] Shutdown did not settle: FlushTrouble']);
    expect(stderr.join('\n')).not.toContain('a token');
    expect(exits).toEqual([1]);
  });

  it('two calls of run() answer the same run', async () => {
    const held = deferred<{ notStored: string[] }>();
    const s = setup({ settle: () => held.promise });
    const first = s.run();
    const second = s.run();
    await turns();
    held.resolve({ notStored: [] });
    await Promise.all([first, second]);
    expect(s.order.filter((o) => o === 'settle')).toHaveLength(1);
    expect(s.exits).toEqual([0]);
  });
});
