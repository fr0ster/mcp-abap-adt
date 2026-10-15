/**
 * The program's shutdown, stdio (spec §6.4, D33): every trigger — a signal,
 * or stdin's end (the client closed the transport) — runs one sequence: the
 * latch, the logoffs at once with every running tool interrupted (none
 * awaited), the MCP server's close, then the factory's settle (gate,
 * logins, drain, flush), then the exit code — once, and nothing of it
 * reaches stdout.
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
    '%s runs the sequence: latch and begin in its tick, the MCP server closed, then settle, exit 0',
    async (_name, trigger) => {
      const s = setup();
      trigger(s.processLike);
      // In the trigger's tick: the latch and the factory's begin.
      expect(isLatched()).toBe(true);
      expect(s.order).toEqual(['begin']);
      await turns();
      expect(s.order).toEqual([
        'begin',
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

  it('a running tool is interrupted in the trigger’s tick and not awaited: the sequence runs to its exit without it', async () => {
    const s = setup();
    const tool = runningTool();
    s.processLike.emit('SIGTERM');
    expect(tool.signal.aborted).toBe(true);
    await turns();
    expect(s.order).toEqual([
      'begin',
      'mcp close',
      'settle',
      'settled',
      'exit(0)',
    ]);
    tool.end();
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
        endLogins: async () => {},
        settle: async () => {
          throw new FlushTrouble('a token, perhaps');
        },
      },
      instance: { close: async () => {} },
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
