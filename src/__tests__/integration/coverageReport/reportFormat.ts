/**
 * The run's files and their shape (spec §8, "Live"; plan C2): the call log a
 * live case writes, the outcomes the run's ledger reporter writes from
 * node:test's completed results, the files that ran, the leftovers named for
 * the owner, and the credential-refusal marker.
 *
 * They live in one directory per run, under the OS temp directory, never in
 * the repository: the one `MCP_ABAP_ADT_COVERAGE_RUN` names (the runner's
 * live setup makes it and sets the variable, so every file's process, the
 * reporter and the teardown share it), else one of this process.
 *
 * A test is named by its file — its repository source path, `….test.ts`,
 * whether it runs from its source or from the node:test build — and its
 * name path: the titles from the file down to the test, joined by
 * `NAME_SEPARATOR`, which is node:test's own `t.fullName` (D27, spec §3).
 * `liveCall` takes `t.fullName`, the reporter rebuilds it with `namePath`,
 * and both meet in `testKey`.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** The variable naming the run's directory. */
export const RUN_VARIABLE = 'MCP_ABAP_ADT_COVERAGE_RUN';

/** The system kinds a live run reaches. */
export type RunSystem = 'onprem' | 'cloud';

/** How a key fared: its test's completed result. */
export type KeyOutcome = 'passed' | 'failed' | 'skipped';

/** The separator of a name path: node:test's own in `t.fullName`. */
export const NAME_SEPARATOR = ' > ';

/** The name path of a test whose titles, from the file down, are `titles`. */
export function namePath(titles: readonly string[]): string {
  return titles.join(NAME_SEPARATOR);
}

/** The one key a test is joined by: its file and its name path. */
export function testKey(file: string, path: string): string {
  return JSON.stringify([file, path]);
}

/** The marker of the node:test build: a compiled test lives under it. */
const BUILD_TREE = ['.test-build', 'tree'];

/**
 * The repository source path (`/` separators, `….test.ts`) of a test file,
 * given as its source or its compiled file in the node:test build, an
 * absolute path under `root`.
 */
export function sourcePathOf(file: string, root: string): string {
  const parts = path.relative(root, file).split(path.sep);
  const inBuild = parts[0] === BUILD_TREE[0] && parts[1] === BUILD_TREE[1];
  const source = inBuild ? parts.slice(BUILD_TREE.length) : parts;
  const last = source.pop() ?? '';
  const named =
    inBuild && last.endsWith('.js')
      ? `${last.slice(0, -'.js'.length)}.ts`
      : last;
  return [...source, named].join('/');
}

/** One entry of the call log: which test (in which file) called which key, on which system. */
export interface CallLogEntry {
  /** The test file's repository source path (`sourcePathOf`). */
  file: string;
  /** The test's name path (`t.fullName`). */
  test: string;
  key: string;
  system: RunSystem;
}

/** One outcome of the run report. */
export interface OutcomeEntry {
  key: string;
  system: RunSystem;
  outcome: KeyOutcome;
}

const CALL_LOG = 'calls.jsonl';
const OUTCOMES = 'report.jsonl';
const FILES = 'files.jsonl';
const LEFTOVERS = 'leftovers.jsonl';
const MARKER = 'credential-refused';

let ownRunDirectory: string | undefined;

/** Set beside the run's directory when `globalSetup` made it: `globalTeardown` removes it. */
const OWNED_VARIABLE = 'MCP_ABAP_ADT_COVERAGE_RUN_OWNED';

/** A new run directory under the OS temp directory, named per run. */
export function newRunDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-abap-adt-coverage-'));
}

/** Makes the run's directory and names it for the run, owned by the run. */
export function startRunDirectory(): void {
  process.env[RUN_VARIABLE] = newRunDirectory();
  process.env[OWNED_VARIABLE] = '1';
}

/** Removes the run's directory when the run made it (`startRunDirectory`). */
export function removeOwnRunDirectory(): void {
  const named = process.env[RUN_VARIABLE];
  if (process.env[OWNED_VARIABLE] !== '1' || named === undefined) return;
  fs.rmSync(named, { recursive: true, force: true });
  delete process.env[RUN_VARIABLE];
  delete process.env[OWNED_VARIABLE];
}

/** Where this run's files live. */
export function runDirectory(): string {
  const named = process.env[RUN_VARIABLE];
  if (named !== undefined && named.trim() !== '') {
    fs.mkdirSync(named, { recursive: true });
    return named;
  }
  if (ownRunDirectory === undefined) {
    const made = newRunDirectory();
    // This process's own directory goes when the process ends.
    process.once('exit', () => {
      fs.rmSync(made, { recursive: true, force: true });
    });
    ownRunDirectory = made;
  }
  return ownRunDirectory;
}

const fileOf = (name: string): string => path.join(runDirectory(), name);

/** The run report's path: the outcomes the reporter wrote. */
export function outcomesPath(): string {
  return fileOf(OUTCOMES);
}

function append(name: string, value: object): void {
  fs.appendFileSync(fileOf(name), `${JSON.stringify(value)}\n`);
}

/** A run file's lines, parsed; empty when it does not exist. */
function lines(name: string): unknown[] {
  const file = fileOf(name);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line): unknown => JSON.parse(line));
}

/** A parsed line's member, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? Reflect.get(value, key)
    : undefined;
}

const isSystem = (value: unknown): value is RunSystem =>
  value === 'onprem' || value === 'cloud';

const isOutcome = (value: unknown): value is KeyOutcome =>
  value === 'passed' || value === 'failed' || value === 'skipped';

export function appendCall(entry: CallLogEntry): void {
  append(CALL_LOG, entry);
}

/** The run's call log, as written. */
export function readCallLog(): CallLogEntry[] {
  return lines(CALL_LOG).flatMap((line): CallLogEntry[] => {
    const file = member(line, 'file');
    const test = member(line, 'test');
    const key = member(line, 'key');
    const system = member(line, 'system');
    return typeof file === 'string' &&
      typeof test === 'string' &&
      typeof key === 'string' &&
      isSystem(system)
      ? [{ file, test, key, system }]
      : [];
  });
}

export function appendOutcome(entry: OutcomeEntry): void {
  append(OUTCOMES, entry);
}

/** The run report's outcomes, as written. */
export function readOutcomes(): OutcomeEntry[] {
  return lines(OUTCOMES).flatMap((line): OutcomeEntry[] => {
    const key = member(line, 'key');
    const system = member(line, 'system');
    const outcome = member(line, 'outcome');
    return typeof key === 'string' && isSystem(system) && isOutcome(outcome)
      ? [{ key, system, outcome }]
      : [];
  });
}

/** Records a test file that ran, by its repository path. */
export function appendFileRan(file: string): void {
  append(FILES, { file });
}

/** The repository paths of the test files that ran. */
export function readFilesRan(): string[] {
  return lines(FILES).flatMap((line) => {
    const file = member(line, 'file');
    return typeof file === 'string' ? [file] : [];
  });
}

/** Names what a run left behind for the owner to remove, once each. */
export function appendLeftover(what: string): void {
  if (readLeftovers().includes(what)) return;
  append(LEFTOVERS, { leftover: what });
}

/** What the run report names as left behind. */
export function readLeftovers(): string[] {
  return lines(LEFTOVERS).flatMap((line) => {
    const value = member(line, 'leftover');
    return typeof value === 'string' ? [value] : [];
  });
}

/** Latches the run's credential-refusal marker: nothing is sent after it. */
export function writeMarker(): void {
  fs.writeFileSync(fileOf(MARKER), new Date().toISOString());
}

/** Whether the run's credential-refusal marker exists; makes no directory. */
export function markerExists(): boolean {
  const named = process.env[RUN_VARIABLE];
  const dir =
    named !== undefined && named.trim() !== '' ? named : ownRunDirectory;
  return dir !== undefined && fs.existsSync(path.join(dir, MARKER));
}
