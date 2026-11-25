/**
 * Runs a scenario under plain node, where an unhandled rejection is seen.
 *
 * Inside a test runner an unhandled rejection is the runner's, not the
 * test's (node:test fails the file on one), so "no unhandled rejection" cannot be asserted in-process. A scenario is a TypeScript file run by `process.execPath`
 * through tsx (`--import tsx`); it records with `plainNodeRecorder.ts` and
 * writes its report as the last line of its stdout. Nothing else is started:
 * the child is node itself, and the scenario talks to no system.
 *
 * No child outlives its test: every child still running when a test ends
 * is killed (`SIGKILL`) and awaited in a node:test `afterEach` this module
 * registers for the file that imports it, and a `signal` given kills it when
 * it aborts — so a scenario that hangs is never orphaned.
 *
 * The child runs with tsx pointed at the test configuration (its
 * package-name aliases) and without `NODE_TEST_CONTEXT`, which node:test sets
 * in a test file's process and which would make the child report to the
 * runner (as `scenarioOutput.ts`).
 */
import { type ChildProcess, execFile } from 'node:child_process';
import * as path from 'node:path';
import { afterEach } from 'node:test';
import { repositoryRoot } from './repoRoot';

const ROOT = repositoryRoot(__dirname);

/** The child's environment: this process's, tsx's configuration, no test context. */
function childEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TSX_TSCONFIG_PATH: path.join(ROOT, 'tsconfig.test.json'),
  };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

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

afterEach(() => killPlainNodeChildren());

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
        env: childEnvironment(),
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
          // A report counts only from a child that ended well: one that
          // failed after writing it is a failure.
          if (parsed !== undefined && error !== null) {
            reject(
              new Error(
                `the scenario failed after its report (exit ${String(error.code ?? error.signal)}): ${stderr.slice(-2000)}`,
              ),
            );
            return;
          }
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
