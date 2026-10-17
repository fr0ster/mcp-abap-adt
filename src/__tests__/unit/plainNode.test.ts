/**
 * `plainNode.ts` never orphans a child: a scenario still running when its
 * test ends is killed and awaited by the helper's `afterEach`, and one given
 * a `signal` is killed when it aborts.
 */
import { runPlainNode } from '../helpers/plainNode';

const HANG = 'src/__tests__/unit/scenarios/hang.scenario.ts';

/** Whether a process with `pid` exists. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Kills `pid` if the helper left it running, so a red run orphans nothing. */
function reap(pid: number | undefined): void {
  if (pid !== undefined && alive(pid)) process.kill(pid, 'SIGKILL');
}

describe('a hanging scenario', () => {
  let pid: number | undefined;

  it('runs past its test', async () => {
    const started = new Promise<number>((resolve) => {
      void runPlainNode(HANG, [], { onStart: resolve }).catch(() => undefined);
    });
    pid = await started;
    expect(alive(pid)).toBe(true);
    // The test ends with the child still running.
  });

  it('is gone once that test has ended', () => {
    const left = pid !== undefined && alive(pid);
    reap(pid);
    expect(pid).toBeDefined();
    expect(left).toBe(false);
  });
});

it('a signal kills a hanging scenario: its run rejects, the child is gone', async () => {
  const controller = new AbortController();
  let pid: number | undefined;
  const run = runPlainNode(HANG, [], {
    signal: controller.signal,
    onStart: (started) => {
      pid = started;
    },
  });
  const rejected = expect(run).rejects.toThrow('the scenario wrote no report');
  controller.abort();
  await rejected;
  const left = pid !== undefined && alive(pid);
  reap(pid);
  expect(left).toBe(false);
});
