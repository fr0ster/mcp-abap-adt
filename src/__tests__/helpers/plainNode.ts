/**
 * Runs a scenario under plain node, where an unhandled rejection is seen.
 *
 * Inside Jest a test's `process.on('unhandledRejection', …)` is never told
 * of one (the test runs in a sandbox; measured: a bare `Promise.reject()`
 * reaches no listener there), so "no unhandled rejection" cannot be asserted
 * in-process. A scenario is a TypeScript file run by `process.execPath`
 * through tsx (`--import tsx`); it records with `plainNodeRecorder.ts` and
 * writes its report as the last line of its stdout. Nothing else is started:
 * the child is node itself, and the scenario talks to no system.
 *
 * No child outlives its test: every child still running when a test ends
 * is killed (`SIGKILL`) and awaited in an `afterEach` this module registers,
 * and a `signal` given kills it when it aborts — so a scenario that hangs
 * past Jest's timeout is never orphaned.
 */
import { type ChildProcess, execFile } from 'node:child_process';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..', '..');

/** The report a scenario wrote (`report()`), with the unhandled rejections it saw. */
export type ScenarioReport = { unhandled: string[] } & Record<string, unknown>;

export interface PlainNodeOptions {
  /** Aborted: the child is killed at once. */
  signal?: AbortSignal;
  /** Told the child's pid once it is started. */
  onStart?: (pid: number) => void;
}

const live = new Set<ChildProcess>();

const exited = (child: ChildProcess) =>
  child.exitCode !== null || child.signalCode !== null;

/** Kills every child still running and waits until each has exited. */
export async function killPlainNodeChildren(): Promise<void> {
  const running = [...live];
  live.clear();
  await Promise.all(
    running.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (exited(child)) {
            resolve();
            return;
          }
          child.once('exit', () => resolve());
          child.kill('SIGKILL');
        }),
    ),
  );
}

if (typeof afterEach === 'function') {
  afterEach(() => killPlainNodeChildren());
}

/** Runs `scenario` (a path under the repository) with `args`; answers its report. */
export function runPlainNode(
  scenario: string,
  args: string[] = [],
  options: PlainNodeOptions = {},
): Promise<ScenarioReport> {
  return new Promise((resolve, reject) => {
    // Settled once the child has exited and its callback ran, both: an
    // abort calls back before the child is gone.
    let settle: (() => void) | undefined;
    let gone = false;
    const settleWhenGone = (outcome: () => void) => {
      settle = outcome;
      if (gone) outcome();
    };
    const child = execFile(
      process.execPath,
      ['--import', 'tsx', path.resolve(ROOT, scenario), ...args],
      {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        killSignal: 'SIGKILL',
        ...(options.signal !== undefined && { signal: options.signal }),
      },
      (error, stdout, stderr) => {
        const lines = stdout.trim().split('\n');
        const last = lines[lines.length - 1] ?? '';
        let parsed: ScenarioReport | undefined;
        try {
          parsed = JSON.parse(last) as ScenarioReport;
        } catch {
          parsed = undefined;
        }
        settleWhenGone(() => {
          if (parsed !== undefined) {
            resolve(parsed);
            return;
          }
          reject(
            new Error(
              `the scenario wrote no report (${error ? `exit ${String(error.code ?? error.signal)}` : 'exit 0'}): ${stderr.slice(-2000)}`,
            ),
          );
        });
      },
    );
    live.add(child);
    child.once('exit', () => {
      live.delete(child);
      gone = true;
      settle?.();
    });
    if (child.pid !== undefined) options.onStart?.(child.pid);
  });
}
