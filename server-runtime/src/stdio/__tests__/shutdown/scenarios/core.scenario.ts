/**
 * Plain-node scenario (`scenarioOutput.ts`) for `shutdown.test.ts`: one case
 * of installShutdown (the first argument names it) in a process of its own,
 * so the test owns that process's stdout as a client does — nothing of the
 * shutdown may reach it (H3). The case runs as the test ran it in-process,
 * and what the test asserts is recorded at the same points (the order in
 * the trigger's tick and after the turns, stderr, the exit codes, a throw's
 * message); the record is this process's one stdout line.
 */
import { isLatched } from '../../../../../../src/lib/activeTools';
import { installShutdown } from '../../../shutdown.js';
import { deferred, fakeProcess, runningTool, setup, turns } from '../harness';

type Facts = Record<string, unknown>;

const triggers: Record<string, (p: ReturnType<typeof fakeProcess>) => boolean> =
  {
    SIGTERM: (p) => p.emit('SIGTERM'),
    SIGINT: (p) => p.emit('SIGINT'),
    'stdin end': (p) => p.stdin.emit('end'),
    'stdin close': (p) => p.stdin.emit('close'),
  };

const cases: Record<string, () => Promise<Facts>> = {
  sequence: async () => {
    const trigger = triggers[process.argv[3] ?? ''];
    if (trigger === undefined) throw new Error('no such trigger');
    const s = setup();
    trigger(s.processLike);
    // In the trigger's tick: the latch and the factory's begin.
    const latchedInTick = isLatched();
    const orderInTick = [...s.order];
    await turns();
    return { latchedInTick, orderInTick, order: s.order, stderr: s.stderr };
  },
  'stdin end not asked for': async () => {
    const s = setup({ onStdinEnd: false });
    s.processLike.stdin.emit('end');
    await turns();
    return { order: s.order };
  },
  'running tool': async () => {
    const s = setup();
    const tool = runningTool();
    s.processLike.emit('SIGTERM');
    const abortedInTick = tool.signal.aborted;
    await turns();
    const order = [...s.order];
    tool.end();
    return { abortedInTick, order };
  },
  'not stored': async () => {
    const s = setup({
      settle: async () => ({
        notStored: ['"X": StorageError', '"Y": StorageError'],
      }),
    });
    await s.run();
    return { stderr: s.stderr, exits: s.exits };
  },
  'settle throws': async () => {
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
    return { stderr, exits };
  },
  'foreign birth': async () => {
    const processLike = fakeProcess();
    try {
      installShutdown({
        factory: {
          beginShutdown: () => {},
          endLogins: async () => {},
          settle: async () => ({ notStored: [] }),
        },
        instance: { close: async () => {} },
        exit: () => {},
        stderr: () => {},
        processLike,
        birth: {
          shutdownBegan: () => false,
          joining: (birth) => birth,
          open: () => true,
        },
      });
    } catch (error) {
      return {
        threw: true,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    return { threw: false };
  },
  'run twice': async () => {
    const held = deferred<{ notStored: string[] }>();
    const s = setup({ settle: () => held.promise });
    const first = s.run();
    const second = s.run();
    await turns();
    held.resolve({ notStored: [] });
    await Promise.all([first, second]);
    return {
      settles: s.order.filter((o) => o === 'settle').length,
      exits: s.exits,
    };
  },
};

async function main(): Promise<void> {
  const run = cases[process.argv[2] ?? ''];
  if (run === undefined) throw new Error('no such case');
  const facts = await run();
  // The process ends by itself once the line is flushed, never through
  // process.exit(): see `report()` in plainNodeRecorder.ts.
  process.exitCode = 0;
  process.stdout.write(`${JSON.stringify(facts)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `the scenario failed: ${error instanceof Error ? error.name : 'value'}\n`,
  );
  process.exit(1);
});
