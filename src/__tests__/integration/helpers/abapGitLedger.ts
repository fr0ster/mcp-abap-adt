/**
 * The abapGit live suite's recovery ledger and the cloud-run correlation.
 *
 * **Correlation (spec §7).** Before a cloud run is submitted, the suite notes
 * the repository's log key in R1 (`L0`). The run is this run's — and over —
 * only once R1 shows a log key other than `L0` **and** a terminal status
 * (`S`, `W`, `E`, `A`); blank (initial) and `R` mean waiting, and a terminal
 * status under `L0` is the previous run's. The wait ends on SAP's answer or
 * the caller's own cancel; nothing here picks a deadline.
 *
 * **Recovery.** Every fixture is recorded here before it is relied on and as
 * soon as it exists — the branches, the package, each object, the repository
 * key, and a submitted cloud run with its `L0`. A run that is cancelled, or
 * that cannot correlate its job, keeps its fixtures and its entry; the next
 * run works the ledger first: for each entry of its own backend and system it
 * waits as above, then cleans up exactly what the entry names, and removes
 * the entry. Nothing the entry does not name is ever deleted.
 *
 * **One run at a time.** Recovery takes every entry of its system for
 * abandoned, and the file is written whole on every change; both hold only
 * while one run owns the ledger. The suite takes the run lock
 * (`acquireRunLock`: its pid and start time, linked into place whole) before
 * recovery and releases it in a `finally` around teardown; a run that finds
 * the lock refuses and touches nothing. A lock a dead run left is removed by
 * hand, never taken over.
 *
 * The file is gitignored and sits beside the test config
 * (`tests/abapgit-live.ledger.json`, the lock `tests/abapgit-live.lock`).
 *
 * Ported from adt-clients' live suite helper
 * (`packages/adt-clients/src/__tests__/helpers/abapGitLedger.ts`): the same
 * correlation, ledger, lock and cleanup order.
 */

import { randomUUID } from 'node:crypto';
import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { repositoryRoot } from '../../helpers/repoRoot';

export type AbapGitBackend = 'onprem' | 'cloud';

/** R1's terminal run statuses (`IF_ABAPGIT_APP_LOG=>c_run_status`). */
export const TERMINAL_STATUSES: readonly string[] = ['S', 'W', 'E', 'A'];

export const LEDGER_FILE = join(
  repositoryRoot(__dirname),
  'tests',
  'abapgit-live.ledger.json',
);

/** The run lock: one suite at a time owns the ledger and its fixtures. */
export const LOCK_FILE = join(
  repositoryRoot(__dirname),
  'tests',
  'abapgit-live.lock',
);

/** What a run lock holds: its pid and when it started. */
export interface IRunLockContent {
  readonly pid: number;
  readonly startedAt: string;
}

/** A lock file exists: this run starts nothing and cleans up nothing. */
export class RunLockHeld extends Error {
  constructor(file: string, content: IRunLockContent | undefined) {
    super(
      `the abapGit live run lock ${file} exists (pid ${content?.pid ?? 'unknown'}, started ${content?.startedAt ?? 'unknown'}): this run starts nothing and cleans up nothing. If no run is alive, remove ${file} by hand and run again.`,
    );
    this.name = 'RunLockHeld';
  }
}

/** The lock file's content, or `undefined` when it holds none readable. */
export function readRunLock(file: string): IRunLockContent | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed === null || typeof parsed !== 'object') return undefined;
    const pid: unknown = Reflect.get(parsed, 'pid');
    const startedAt: unknown = Reflect.get(parsed, 'startedAt');
    return typeof pid === 'number' && typeof startedAt === 'string'
      ? { pid, startedAt }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Take the run lock. The content — the pid and the start time — is written
 * whole to a uniquely named file first, then hard-linked to the lock path:
 * `link` fails when the lock exists, so the lock is never seen empty and two
 * runs cannot both take it. An existing lock refuses (`RunLockHeld`), alive
 * or not: there is no automatic takeover, so neither a takeover race nor a
 * reused pid can hand a live run's fixtures to another. A lock left by a run
 * that died is removed by hand. Answers the release.
 *
 * Startup recovery treats every ledger entry of its system as abandoned, and
 * the ledger is read, changed and written whole: both are sound only while
 * one run at a time holds this lock, from before recovery to after teardown.
 */
export function acquireRunLock(
  file: string = LOCK_FILE,
  content: IRunLockContent = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
  },
): () => void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${content.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(content)}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  try {
    linkSync(temporary, file);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      Reflect.get(error, 'code') === 'EEXIST'
    )
      throw new RunLockHeld(file, readRunLock(file));
    throw error;
  } finally {
    unlinkSync(temporary);
  }
  return () => unlinkSync(file);
}

/**
 * Run `teardown`, then release the lock whatever it threw — a bad ledger
 * file included; the teardown's exception is rethrown after the release.
 */
export async function releasingRunLock(
  release: () => void,
  teardown: () => Promise<void>,
): Promise<void> {
  try {
    await teardown();
  } finally {
    release();
  }
}

/** A cloud run submitted and not yet seen terminal under a new log key. */
export interface IPendingRun {
  /** What was submitted (`push`, `pullRepo`, …), for messages. */
  readonly what: string;
  /** R1's log key for the repository before the submit; `null`: none. */
  readonly l0: string | null;
}

export interface ILedgerEntry {
  readonly runId: string;
  readonly backend: AbapGitBackend;
  /** The system the run reached: its address and client, no credential. */
  readonly systemKey: string;
  /** The remote URL SAP was given. */
  readonly url: string;
  /** Branches this run created in the remote. */
  readonly branches: readonly string[];
  /** The package this run created, once created. */
  readonly package?: string | undefined;
  /** The request the package and objects were recorded in (onprem). */
  readonly transportRequest?: string | undefined;
  /** Interfaces this run created, once created. */
  readonly interfaces: readonly string[];
  /** The repository key, once linked. */
  readonly repoKey?: string | undefined;
  /** A cloud run whose end has not been seen. */
  readonly pending?: IPendingRun | undefined;
}

/** One repository's run state in R1. */
export interface IRunRow {
  readonly runStatus: string | undefined;
  readonly appLogKey: string | undefined;
}

export type RunState = 'waiting' | 'terminal' | 'gone';

/**
 * Where a submitted run stands, read off R1's row for its repository:
 * `terminal` only with a log key other than `l0` and a terminal status.
 */
export function runState(
  row: IRunRow | undefined,
  l0: string | null,
): RunState {
  if (row === undefined) return 'gone';
  const fresh =
    row.appLogKey !== undefined && row.appLogKey !== '' && row.appLogKey !== l0;
  const terminal =
    row.runStatus !== undefined && TERMINAL_STATUSES.includes(row.runStatus);
  return fresh && terminal ? 'terminal' : 'waiting';
}

/** The caller cancelled the wait. */
export class RunWaitCancelled extends Error {
  constructor(what: string, l0: string | null, last: IRunRow | undefined) {
    super(
      `the wait for ${what} was cancelled before R1 showed a log key other than ${l0 ?? '(none)'} with a terminal status (last seen: status ${last?.runStatus ?? '(none)'}, log key ${last?.appLogKey ?? '(none)'})`,
    );
    this.name = 'RunWaitCancelled';
  }
}

/**
 * Poll R1 (through `readRow`) until the run is terminal under a new log key.
 * Answers that row; rejects with {@link RunWaitCancelled} when `signal`
 * aborts first, and when the repository leaves R1 (nothing left to wait on).
 */
export async function waitForRun(
  readRow: () => Promise<IRunRow | undefined>,
  pending: IPendingRun,
  signal: AbortSignal,
): Promise<IRunRow & { readonly appLogKey: string }> {
  let last: IRunRow | undefined;
  for (;;) {
    if (signal.aborted)
      throw new RunWaitCancelled(pending.what, pending.l0, last);
    last = await readRow();
    const state = runState(last, pending.l0);
    if (state === 'terminal' && last?.appLogKey)
      return { ...last, appLogKey: last.appLogKey };
    if (state === 'gone')
      throw new Error(
        `the repository left the repository list while waiting for ${pending.what}`,
      );
  }
}

/** The ledger file: entries by run id, written whole on every change. */
export class AbapGitLedger {
  constructor(private readonly file: string = LEDGER_FILE) {}

  entries(): ILedgerEntry[] {
    if (!existsSync(this.file)) return [];
    const parsed: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
    if (!Array.isArray(parsed))
      throw new Error(`${this.file} is not a ledger: expected a JSON array`);
    // The file is this suite's own, written whole by `write` only.
    const entries: ILedgerEntry[] = parsed;
    return entries;
  }

  /** The entries of one backend and system: the only ones a run touches. */
  entriesOf(backend: AbapGitBackend, systemKey: string): ILedgerEntry[] {
    return this.entries().filter(
      (entry) => entry.backend === backend && entry.systemKey === systemKey,
    );
  }

  find(runId: string): ILedgerEntry | undefined {
    return this.entries().find((entry) => entry.runId === runId);
  }

  /** Record the entry, replacing the one of its run id. */
  put(entry: ILedgerEntry): void {
    const others = this.entries().filter((e) => e.runId !== entry.runId);
    this.write([...others, entry]);
  }

  /** Change the entry of `runId`; refused when there is none. */
  amend(
    runId: string,
    change: (entry: ILedgerEntry) => ILedgerEntry,
  ): ILedgerEntry {
    const entry = this.find(runId);
    if (!entry) throw new Error(`no ledger entry for run ${runId}`);
    const next = change(entry);
    this.put(next);
    return next;
  }

  remove(runId: string): void {
    this.write(this.entries().filter((entry) => entry.runId !== runId));
  }

  private write(entries: readonly ILedgerEntry[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(entries, null, 2)}\n`, {
      mode: 0o600,
    });
    renameSync(temporary, this.file);
  }
}

/** What cleaning up one ledger entry needs, injected by the suite. */
export interface ICleanupSteps {
  /** R1's row for the key, or `undefined` when R1 does not list it. */
  readonly readRow: (repoKey: string) => Promise<IRunRow | undefined>;
  readonly unlink: (repoKey: string) => Promise<void>;
  readonly deleteInterface: (
    name: string,
    transportRequest: string | undefined,
  ) => Promise<void>;
  readonly deletePackage: (
    name: string,
    transportRequest: string | undefined,
  ) => Promise<void>;
  /** Delete `name` in the remote `remoteUrl` the entry recorded; resolves once its absence is confirmed. */
  readonly deleteBranch: (name: string, remoteUrl: string) => Promise<void>;
}

/**
 * Clean up exactly what `entry` names, in the spec's order: wait for a
 * pending cloud run, unlink (asserting R1 no longer lists the key), delete
 * the objects, the package, the branches; then remove the entry. Each step
 * that succeeds is struck from the entry first, so a cleanup cut short
 * resumes where it stopped. The wait is bounded by `signal` alone.
 */
export async function cleanUpEntry(
  ledger: AbapGitLedger,
  runId: string,
  steps: ICleanupSteps,
  signal: AbortSignal,
): Promise<void> {
  let entry = ledger.find(runId);
  if (!entry) return;
  const { repoKey } = entry;
  if (entry.pending && repoKey) {
    await waitForRun(() => steps.readRow(repoKey), entry.pending, signal);
    entry = ledger.amend(runId, (e) => ({ ...e, pending: undefined }));
  }
  if (repoKey) {
    if ((await steps.readRow(repoKey)) !== undefined)
      await steps.unlink(repoKey);
    if ((await steps.readRow(repoKey)) !== undefined)
      throw new Error(`repository ${repoKey} is still listed after unlink`);
    entry = ledger.amend(runId, (e) => ({ ...e, repoKey: undefined }));
  }
  for (const name of entry.interfaces) {
    await steps.deleteInterface(name, entry.transportRequest);
    entry = ledger.amend(runId, (e) => ({
      ...e,
      interfaces: e.interfaces.filter((n) => n !== name),
    }));
  }
  if (entry.package) {
    await steps.deletePackage(entry.package, entry.transportRequest);
    entry = ledger.amend(runId, (e) => ({ ...e, package: undefined }));
  }
  for (const name of entry.branches) {
    await steps.deleteBranch(name, entry.url);
    entry = ledger.amend(runId, (e) => ({
      ...e,
      branches: e.branches.filter((n) => n !== name),
    }));
  }
  ledger.remove(runId);
}
