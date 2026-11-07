/**
 * The run report (spec §8, acceptance 3; plan C2): what the reporter wrote
 * from Jest's completed results, compared with the ledger by
 * `globalTeardown`.
 *
 * - A **full** run (`npm run test:integration`) requires every key the
 *   ledger requires on the configured system.
 * - A **family** run (`npm run test:coverage-family -- <files>`) requires
 *   only the keys whose live file on that system is one of the files that
 *   ran.
 * A required key passes only when every test that called it passed; a key
 * that failed, was skipped, or never ran fails the run.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  appendOutcome,
  type KeyOutcome,
  type OutcomeEntry,
  outcomesPath,
  type RunSystem,
} from '../coverageReport/reportFormat';

/** The run report's path, under the run's directory in the OS temp directory. */
export function reportPath(): string {
  return outcomesPath();
}

/** Records a key's outcome on a system in the run report. */
export function recordOutcome(
  key: string,
  kind: RunSystem,
  outcome: KeyOutcome,
): void {
  appendOutcome({ key, system: kind, outcome });
}

/** The ledger's live file per system, per key. */
export type LiveFiles = ReadonlyMap<string, Partial<Record<RunSystem, string>>>;

/** The ledger's live files, read from the parsed `coverage-ledger.json`. */
export function liveFilesOf(ledger: unknown): LiveFiles {
  if (typeof ledger !== 'object' || ledger === null || Array.isArray(ledger)) {
    throw new Error('the coverage ledger is not an object');
  }
  const rows = new Map<string, Partial<Record<RunSystem, string>>>();
  for (const [key, row] of Object.entries(ledger)) {
    const live: unknown =
      typeof row === 'object' && row !== null
        ? Reflect.get(row, 'live')
        : undefined;
    const files: Partial<Record<RunSystem, string>> = {};
    for (const system of ['onprem', 'cloud'] as const) {
      const file: unknown =
        typeof live === 'object' && live !== null
          ? Reflect.get(live, system)
          : undefined;
      if (typeof file === 'string') files[system] = file;
    }
    rows.set(key, files);
  }
  return rows;
}

/** The repository's ledger, parsed. */
export function readLedger(root: string): LiveFiles {
  const file = path.join(
    root,
    'tests',
    'fixtures',
    'tools',
    'coverage-ledger.json',
  );
  return liveFilesOf(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/** Which keys a run requires: all the ledger names for its system, or those of the files that ran. */
export type RunScope =
  | { readonly kind: 'full' }
  | { readonly kind: 'family'; readonly files: readonly string[] };

/** A required key's state: `passed`, or what keeps it from passing. */
type KeyState = 'passed' | 'failed' | 'skipped' | 'not run';

function stateOf(
  key: string,
  system: RunSystem,
  outcomes: readonly OutcomeEntry[],
): KeyState {
  const own = outcomes.filter((o) => o.key === key && o.system === system);
  if (own.length === 0) return 'not run';
  if (own.some((o) => o.outcome === 'failed')) return 'failed';
  if (own.some((o) => o.outcome === 'skipped')) return 'skipped';
  return 'passed';
}

/**
 * The problems of a run: each key the scope requires on `system` that did
 * not pass, with its state. Empty when the run covered what it had to.
 */
export function checkRunReport(input: {
  ledger: LiveFiles;
  outcomes: readonly OutcomeEntry[];
  system: RunSystem;
  scope: RunScope;
}): string[] {
  const { ledger, outcomes, system, scope } = input;
  const problems: string[] = [];
  for (const [key, live] of ledger) {
    const file = live[system];
    if (file === undefined) continue;
    if (scope.kind === 'family' && !scope.files.includes(file)) continue;
    const state = stateOf(key, system, outcomes);
    if (state !== 'passed') problems.push(`${key} on ${system}: ${state}`);
  }
  return problems;
}

/**
 * Which run the running npm script is, by its name
 * (`npm_lifecycle_event`), so no flag or variable chooses the scope:
 * `test:integration` is the full run, `test:coverage-family` a family run;
 * any other (the unit tests' `npm test`) checks nothing.
 */
export function runScriptOf(
  event: string | undefined,
): 'full' | 'family' | undefined {
  if (event === 'test:integration') return 'full';
  if (event === 'test:coverage-family') return 'family';
  return undefined;
}
