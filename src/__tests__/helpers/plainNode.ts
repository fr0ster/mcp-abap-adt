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
 */
import { execFile } from 'node:child_process';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..', '..');

/** The report a scenario wrote (`report()`), with the unhandled rejections it saw. */
export type ScenarioReport = { unhandled: string[] } & Record<string, unknown>;

/** Runs `scenario` (a path under the repository) with `args`; answers its report. */
export function runPlainNode(
  scenario: string,
  args: string[] = [],
): Promise<ScenarioReport> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', path.resolve(ROOT, scenario), ...args],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const lines = stdout.trim().split('\n');
        const last = lines[lines.length - 1] ?? '';
        try {
          resolve(JSON.parse(last) as ScenarioReport);
        } catch {
          reject(
            new Error(
              `the scenario wrote no report (${error ? `exit ${String(error.code)}` : 'exit 0'}): ${stderr.slice(-2000)}`,
            ),
          );
        }
      },
    );
  });
}
