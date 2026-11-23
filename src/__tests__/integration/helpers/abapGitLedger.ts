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
 * **Recovery.** Every create is journaled before its write and settled
 * after it (`createFixture`): `intent`, then `confirmed`, `uncertain` (no
 * answer) or retired (a definite refusal — never deleted). A link is
 * journaled with its package and remote before it is sent and reconciled
 * against R1 by both. A submitted cloud job is opened with its `L0`, one at a
 * time (`openPending`), and closed only once seen terminal or on its route's
 * definite refusal (`isRouteRefusal`). A run that is cancelled, or that
 * cannot correlate its job, keeps its fixtures and its entry; the next run
 * works the ledger first: for each entry of its own backend and system
 * (`systemIdentityOf`) it reconciles the link, waits as above, checks R1's
 * entry against the ledger before the unlink, then deletes what the entry
 * names — an unconfirmed fixture only once it is seen to exist — and removes
 * the entry. Nothing the entry does not name is ever deleted. The waits end
 * on SAP's answer or the runner's stop request (`stopSignalOf`, `helpers/stopSignal.ts`).
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

/** What a run creates: a remote branch, a package, an interface. */
export type FixtureKind = 'branch' | 'package' | 'interface';

/**
 * Where a fixture's create stands: `intent`, journaled before the write;
 * `confirmed`, after the system's success; `uncertain`, when the write got
 * no answer. A definite refusal (the name exists, SAP refused) retires the
 * fixture: it is struck from the entry and never deleted.
 */
export type FixtureState = 'intent' | 'confirmed' | 'uncertain';

export interface IFixture {
  readonly kind: FixtureKind;
  readonly name: string;
  readonly state: FixtureState;
}

/** What a create's write ended with. */
export type WriteOutcome = 'confirmed' | 'refused';

/**
 * A link, journaled with its package and remote before it is sent; its key
 * once R1 lists exactly one repository of that package and remote, and the
 * branch it is on (a switch follows it).
 */
export interface ILinkRecord {
  readonly package: string;
  readonly url: string;
  readonly branch: string;
  readonly state: 'intent' | 'confirmed';
  readonly repoKey?: string | undefined;
}

export interface ILedgerEntry {
  readonly runId: string;
  readonly backend: AbapGitBackend;
  /** The system the run reached, by its effective identity (`systemIdentityOf`), no credential. */
  readonly systemKey: string;
  /** The remote URL SAP was given. */
  readonly url: string;
  /** What this run creates, each with where its create stands. */
  readonly fixtures: readonly IFixture[];
  /** The request the package and objects were recorded in (onprem). */
  readonly transportRequest?: string | undefined;
  /** The link, from its intent on. */
  readonly link?: ILinkRecord | undefined;
  /** A cloud run whose end has not been seen. */
  readonly pending?: IPendingRun | undefined;
}

/** The configured destination as the ledger names its system. */
export interface ISystemSettings {
  readonly connectionType?: string | undefined;
  readonly url?: string | undefined;
  readonly client?: string | undefined;
  readonly ashost?: string | undefined;
  readonly sysnr?: string | undefined;
  readonly mshost?: string | undefined;
  readonly msserv?: string | undefined;
  readonly sysid?: string | undefined;
  readonly group?: string | undefined;
}

/**
 * The system a run reaches, by its effective identity: over RFC the
 * destination's name with its application or message server, system number
 * and client; over HTTP its URL and client. Two systems never share a key,
 * so a run never works another system's entries.
 */
export function systemIdentityOf(
  destination: string,
  settings: ISystemSettings,
): string {
  if (settings.connectionType === 'rfc') {
    return JSON.stringify([
      'rfc',
      destination,
      settings.ashost ?? '',
      settings.sysnr ?? '',
      settings.mshost ?? '',
      settings.msserv ?? '',
      settings.sysid ?? '',
      settings.group ?? '',
      settings.client ?? '',
    ]);
  }
  return JSON.stringify(['http', settings.url ?? '', settings.client ?? '']);
}

/** One repository's run state in R1. */
export interface IRunRow {
  readonly runStatus: string | undefined;
  readonly appLogKey: string | undefined;
}

/** One R1 entry: what it is bound to, and its run state. */
export interface IRepoRow extends IRunRow {
  readonly key: string;
  readonly package: string;
  readonly url: string;
  readonly branchName: string;
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

  /** Journal a fixture's create before its write: `intent`. */
  journal(runId: string, kind: FixtureKind, name: string): void {
    this.amend(runId, (entry) => ({
      ...entry,
      fixtures: [...entry.fixtures, { kind, name, state: 'intent' }],
    }));
  }

  /**
   * Settle a journaled create: `confirmed` or `uncertain` keep it with that
   * state; `refused` (a definite refusal) retires it — it is never deleted.
   */
  settle(
    runId: string,
    kind: FixtureKind,
    name: string,
    outcome: WriteOutcome | 'uncertain',
  ): void {
    this.amend(runId, (entry) => ({
      ...entry,
      fixtures:
        outcome === 'refused'
          ? entry.fixtures.filter((f) => f.kind !== kind || f.name !== name)
          : entry.fixtures.map((f) =>
              f.kind === kind && f.name === name ? { ...f, state: outcome } : f,
            ),
    }));
  }

  /** Journal a link with its package, remote and branch before it is sent. */
  journalLink(
    runId: string,
    link: { package: string; url: string; branch: string },
  ): void {
    this.amend(runId, (entry) => ({
      ...entry,
      link: { ...link, state: 'intent' },
    }));
  }

  /** The link is R1's entry `repoKey`. */
  confirmLink(runId: string, repoKey: string): void {
    this.amend(runId, (entry) => {
      if (entry.link === undefined) {
        throw new Error(`run ${runId}: no link was journaled`);
      }
      return {
        ...entry,
        link: { ...entry.link, state: 'confirmed', repoKey },
      };
    });
  }

  /** The linked repository is on `branch` now (a switch). */
  followBranch(runId: string, branch: string): void {
    this.amend(runId, (entry) => {
      if (entry.link === undefined) {
        throw new Error(`run ${runId}: no link was journaled`);
      }
      return { ...entry, link: { ...entry.link, branch } };
    });
  }

  /**
   * Open a cloud job before its submit; refused while one is open, so an
   * unresolved job is never overwritten by a later one.
   */
  openPending(runId: string, pending: IPendingRun): void {
    this.amend(runId, (entry) => {
      if (entry.pending !== undefined) {
        throw new Error(
          `run ${runId}: ${entry.pending.what} is still unresolved; ${pending.what} is not submitted`,
        );
      }
      return { ...entry, pending };
    });
  }

  /** The open cloud job is resolved: seen terminal, or refused by its route. */
  closePending(runId: string): void {
    this.amend(runId, (entry) => ({ ...entry, pending: undefined }));
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

/**
 * Run a fixture's create journaled: `intent` before `write`, then what it
 * ended with — `confirmed`, or `refused` (retired); a write that throws (no
 * answer) leaves it `uncertain`, and the error goes on.
 */
export async function createFixture(
  ledger: AbapGitLedger,
  runId: string,
  kind: FixtureKind,
  name: string,
  write: () => Promise<WriteOutcome>,
): Promise<WriteOutcome> {
  ledger.journal(runId, kind, name);
  let outcome: WriteOutcome;
  try {
    outcome = await write();
  } catch (error) {
    ledger.settle(runId, kind, name, 'uncertain');
    throw error;
  }
  ledger.settle(runId, kind, name, outcome);
  return outcome;
}

/** SAP's fixed words for an abapGit route's refusal with a T100 key. */
const REFUSED_WITH_MESSAGE =
  'SAP refused the abapGit request with a T100 message.';

/**
 * Whether a submit's tool answer is a definite refusal of its abapGit route:
 * the structured error SAP's handler writes (`cx_adt_rest_abapgit=>
 * raise_with_error`) — the T100 message words, a failing status and its T100
 * key. A bare status, an unreadable answer or no answer is not: the job may
 * exist. As adt-clients' live suite reads it (`settleRefusedSubmit`); a
 * submit is a key route, so its path is the repository's by construction.
 */
export function isRouteRefusal(answer: {
  readonly isError: boolean;
  readonly text: string;
}): boolean {
  if (!answer.isError) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer.text);
  } catch {
    return false;
  }
  const message: unknown =
    typeof parsed === 'object' && parsed !== null
      ? Reflect.get(parsed, 'message')
      : undefined;
  const facts: unknown =
    typeof parsed === 'object' && parsed !== null
      ? Reflect.get(parsed, 'facts')
      : undefined;
  const read = (key: string): unknown =>
    typeof facts === 'object' && facts !== null
      ? Reflect.get(facts, key)
      : undefined;
  const status = read('status');
  const messageClass = read('messageClass');
  const messageNumber = read('messageNumber');
  return (
    message === REFUSED_WITH_MESSAGE &&
    typeof status === 'number' &&
    status >= 400 &&
    typeof messageClass === 'string' &&
    messageClass !== '' &&
    typeof messageNumber === 'string' &&
    messageNumber !== ''
  );
}

/** What cleaning up one ledger entry needs, injected by the suite. */
export interface ICleanupSteps {
  /** R1, whole; it throws when R1 cannot be read. */
  readonly listRepos: () => Promise<readonly IRepoRow[]>;
  readonly unlink: (repoKey: string) => Promise<void>;
  /** Whether the fixture exists: an `intent` or `uncertain` one is deleted only when it does. */
  readonly exists: (
    kind: FixtureKind,
    name: string,
    remoteUrl: string,
  ) => Promise<boolean>;
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

/** R1's entry `key`, or `undefined` when R1 does not list it. */
export async function repoRowOf(
  steps: Pick<ICleanupSteps, 'listRepos'>,
  key: string,
): Promise<IRepoRow | undefined> {
  return (await steps.listRepos()).find((row) => row.key === key);
}

/** The order fixtures are deleted in: objects, then the package, then the branches. */
const DELETE_ORDER: readonly FixtureKind[] = ['interface', 'package', 'branch'];

/**
 * Clean up exactly what `entry` names, in the spec's order:
 *
 * 1. A link intent is reconciled against R1 by its package and remote: one
 *    entry is the link (confirmed), none means it never happened; R1
 *    unreadable or two entries refuse, and nothing is deleted while a link
 *    intent stands unreconciled.
 * 2. A pending cloud job is waited for (bounded by `signal` alone).
 * 3. Before the unlink, R1's entry is checked against the ledger — its
 *    package, remote and branch; any mismatch refuses and keeps the entry.
 *    The unlink is asserted by R1 no longer listing the key.
 * 4. The objects, the package, the branches: a `confirmed` one is deleted;
 *    an `intent` or `uncertain` one only when it exists, else retired.
 *
 * Each step that succeeds is struck from the entry first, so a cleanup cut
 * short resumes where it stopped.
 */
export async function cleanUpEntry(
  ledger: AbapGitLedger,
  runId: string,
  steps: ICleanupSteps,
  signal: AbortSignal,
): Promise<void> {
  let entry = ledger.find(runId);
  if (!entry) return;
  const intent = entry.link;
  if (intent !== undefined && intent.state === 'intent') {
    const matching = (await steps.listRepos()).filter(
      (row) => row.package === intent.package && row.url === intent.url,
    );
    const [only] = matching;
    if (matching.length > 1) {
      throw new Error(
        `run ${runId}: R1 lists ${matching.length} repositories of package ${intent.package} and its remote; the link intent stays unreconciled and nothing is deleted`,
      );
    }
    if (only === undefined) {
      entry = ledger.amend(runId, (e) => ({ ...e, link: undefined }));
    } else {
      ledger.confirmLink(runId, only.key);
      entry = ledger.amend(runId, (e) => e);
    }
  }
  const link = entry.link;
  const repoKey = link?.repoKey;
  if (link !== undefined && repoKey !== undefined) {
    const pending = entry.pending;
    if (pending !== undefined) {
      await waitForRun(async () => repoRowOf(steps, repoKey), pending, signal);
      entry = ledger.amend(runId, (e) => ({ ...e, pending: undefined }));
    }
    const row = await repoRowOf(steps, repoKey);
    if (row !== undefined) {
      const mismatch = [
        row.package !== link.package && 'package',
        row.url !== link.url && 'remote',
        row.branchName !== link.branch && 'branch',
      ].filter((field) => field !== false);
      if (mismatch.length > 0) {
        throw new Error(
          `run ${runId}: R1's repository ${repoKey} differs from the ledger in its ${mismatch.join(', ')}; it is not unlinked and the entry stays`,
        );
      }
      await steps.unlink(repoKey);
      if ((await repoRowOf(steps, repoKey)) !== undefined)
        throw new Error(`repository ${repoKey} is still listed after unlink`);
    }
    entry = ledger.amend(runId, (e) => ({ ...e, link: undefined }));
  }
  for (const kind of DELETE_ORDER) {
    for (const fixture of entry.fixtures.filter((f) => f.kind === kind)) {
      const present =
        fixture.state === 'confirmed' ||
        (await steps.exists(kind, fixture.name, entry.url));
      if (present) {
        if (kind === 'interface')
          await steps.deleteInterface(fixture.name, entry.transportRequest);
        if (kind === 'package')
          await steps.deletePackage(fixture.name, entry.transportRequest);
        if (kind === 'branch')
          await steps.deleteBranch(fixture.name, entry.url);
      }
      entry = ledger.amend(runId, (e) => ({
        ...e,
        fixtures: e.fixtures.filter(
          (f) => f.kind !== kind || f.name !== fixture.name,
        ),
      }));
    }
  }
  ledger.remove(runId);
}
