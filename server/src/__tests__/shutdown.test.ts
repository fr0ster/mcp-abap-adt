/**
 * The program's shutdown: every trigger runs one sequence — servers closed,
 * the factory settled with the 30 s deadline, then the exit code — once, and
 * nothing of it reaches stdout.
 */

import { EventEmitter } from 'node:events';
import type { SettleReport } from '@mcp-abap-adt/lib/auth';
import { installShutdown, SHUTDOWN_DEADLINE_MS } from '../shutdown.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const tick = () => new Promise((r) => setImmediate(r));

function fakeProcess() {
  return Object.assign(new EventEmitter(), { stdin: new EventEmitter() });
}

function setup(
  report: SettleReport | Promise<SettleReport> = {
    abandoned: 0,
    notStored: [],
  },
  onStdinEnd = true,
) {
  const order: string[] = [];
  const exits: number[] = [];
  const stderr: string[] = [];
  const settle = jest.fn(async (deadlineMs: number) => {
    order.push(`settle(${deadlineMs})`);
    return report;
  });
  const servers = [
    { close: jest.fn(async () => void order.push('close a')) },
    { close: jest.fn(() => void order.push('close b')) },
  ];
  const processLike = fakeProcess();
  const run = installShutdown({
    factory: { settle },
    servers,
    onStdinEnd,
    exit: (code) => {
      order.push(`exit(${code})`);
      exits.push(code);
    },
    stderr: (line) => stderr.push(line),
    processLike,
  });
  return { run, order, exits, stderr, settle, servers, processLike };
}

describe('installShutdown', () => {
  let stdout: jest.SpyInstance;
  beforeEach(() => {
    stdout = jest.spyOn(process.stdout, 'write');
  });
  afterEach(() => {
    // Nothing of the shutdown reaches stdout, in any case (H3).
    expect(stdout).not.toHaveBeenCalled();
    stdout.mockRestore();
  });

  it('the deadline is the login timeout, 30 s', () => {
    expect(SHUTDOWN_DEADLINE_MS).toBe(30_000);
  });

  it.each([
    ['SIGTERM', (p: ReturnType<typeof fakeProcess>) => p.emit('SIGTERM')],
    ['SIGINT', (p: ReturnType<typeof fakeProcess>) => p.emit('SIGINT')],
    ['stdin end', (p: ReturnType<typeof fakeProcess>) => p.stdin.emit('end')],
  ])(
    '%s runs the sequence: close every server, settle(30_000), exit 0',
    async (_name, trigger) => {
      const s = setup();
      trigger(s.processLike);
      await tick();
      await tick();
      expect(s.order).toEqual([
        'close a',
        'close b',
        'settle(30000)',
        'exit(0)',
      ]);
      expect(s.stderr).toEqual([]);
    },
  );

  it('stdin end is not a trigger when not asked for (HTTP, SSE)', async () => {
    const s = setup(undefined, false);
    s.processLike.stdin.emit('end');
    await tick();
    expect(s.order).toEqual([]);
  });

  it('two triggers run it once; the second waits for the first', async () => {
    const held = deferred<SettleReport>();
    const s = setup(held.promise);
    s.processLike.emit('SIGTERM');
    s.processLike.emit('SIGINT');
    const second = s.run();
    let secondDone = false;
    void second.then(() => {
      secondDone = true;
    });
    await tick();
    expect(s.settle).toHaveBeenCalledTimes(1);
    expect(secondDone).toBe(false);
    held.resolve({ abandoned: 0, notStored: [] });
    await second;
    expect(s.settle).toHaveBeenCalledTimes(1);
    expect(s.servers[0].close).toHaveBeenCalledTimes(1);
    expect(s.exits).toEqual([0]);
  });

  it('settle waits for every close() first', async () => {
    const closing = deferred<void>();
    const order: string[] = [];
    const settle = jest.fn(async () => {
      order.push('settle');
      return { abandoned: 0, notStored: [] };
    });
    const run = installShutdown({
      factory: { settle },
      servers: [
        {
          close: async () => {
            await closing.promise;
            order.push('closed');
          },
        },
      ],
      exit: () => order.push('exit'),
      stderr: () => {},
      processLike: fakeProcess(),
    });
    const done = run();
    await tick();
    expect(settle).not.toHaveBeenCalled();
    closing.resolve();
    await done;
    expect(order).toEqual(['closed', 'settle', 'exit']);
  });

  it('notStored: one stderr line per destination, exit 1', async () => {
    const s = setup({
      abandoned: 0,
      notStored: ['"X": StorageError', '"Y": StorageError'],
    });
    await s.run();
    expect(s.stderr).toEqual([
      '[MCP] Session secrets not stored: "X": StorageError',
      '[MCP] Session secrets not stored: "Y": StorageError',
    ]);
    expect(s.exits).toEqual([1]);
  });

  it('abandoned 1: its line, exit 1', async () => {
    const s = setup({ abandoned: 1, notStored: [] });
    await s.run();
    expect(s.stderr).toEqual([
      '[MCP] 1 authorization still running at shutdown, its result is lost',
    ]);
    expect(s.exits).toEqual([1]);
  });

  it('abandoned 2: the plural line, exit 1', async () => {
    const s = setup({ abandoned: 2, notStored: [] });
    await s.run();
    expect(s.stderr).toEqual([
      '[MCP] 2 authorizations still running at shutdown, their results are lost',
    ]);
    expect(s.exits).toEqual([1]);
  });

  it('a close() that fails does not stop the settle: its class on stderr, exit 1', async () => {
    const order: string[] = [];
    const stderr: string[] = [];
    const exits: number[] = [];
    class SocketTrouble extends Error {}
    const run = installShutdown({
      factory: {
        settle: async () => {
          order.push('settle');
          return { abandoned: 0, notStored: [] };
        },
      },
      servers: [
        {
          close: () => {
            throw new SocketTrouble('secret-looking detail');
          },
        },
      ],
      exit: (code) => exits.push(code),
      stderr: (line) => stderr.push(line),
      processLike: fakeProcess(),
    });
    await run();
    expect(order).toEqual(['settle']);
    expect(stderr).toEqual([
      '[MCP] A server did not close at shutdown: SocketTrouble',
    ]);
    expect(stderr.join('\n')).not.toContain('secret-looking detail');
    expect(exits).toEqual([1]);
  });

  it('a settle that throws: its class on stderr, exit 1', async () => {
    const stderr: string[] = [];
    const exits: number[] = [];
    class FlushTrouble extends Error {}
    const run = installShutdown({
      factory: {
        settle: async () => {
          throw new FlushTrouble('a token, perhaps');
        },
      },
      servers: [],
      exit: (code) => exits.push(code),
      stderr: (line) => stderr.push(line),
      processLike: fakeProcess(),
    });
    await run();
    expect(stderr).toEqual(['[MCP] Shutdown did not settle: FlushTrouble']);
    expect(exits).toEqual([1]);
  });
});
