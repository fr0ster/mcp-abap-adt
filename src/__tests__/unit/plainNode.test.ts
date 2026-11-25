/**
 * `plainNode.ts` never orphans a child: a scenario still running when its
 * test ends is killed and awaited by the helper's `afterEach`, and one given
 * a `signal` is killed when it aborts. A scenario that fails after writing
 * its report is a failure, not that report.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertRejects } from '../helpers/assertions';
import { runPlainNode } from '../helpers/plainNode';

const HANG = 'src/__tests__/unit/scenarios/hang.scenario.ts';
const REPORT_THEN_FAIL =
  'src/__tests__/unit/scenarios/reportThenFail.scenario.ts';

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
    assert.equal(alive(pid), true);
    // The test ends with the child still running.
  });

  it('is gone once that test has ended', () => {
    const left = pid !== undefined && alive(pid);
    reap(pid);
    assert.notEqual(pid, undefined);
    assert.equal(left, false);
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
  const rejected = assertRejects(run, 'the scenario wrote no report');
  controller.abort();
  await rejected;
  const left = pid !== undefined && alive(pid);
  reap(pid);
  assert.equal(left, false);
});

it('a scenario that writes its report and then exits 1 is a failure, not its report', async () => {
  await assertRejects(
    runPlainNode(REPORT_THEN_FAIL),
    'the scenario failed after its report (exit 1)',
  );
});
