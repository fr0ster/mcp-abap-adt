/**
 * The abapGit live suite's correlation and recovery, over a stubbed R1.
 *
 * A cloud job is over only when R1 shows a log key other than the one noted
 * before the submit (L0) and a terminal status; cleanup stays blocked until
 * then. A cancelled or uncorrelated run keeps its fixtures and a ledger entry
 * with its backend and L0; a later run — a fresh reader of the file — waits
 * the same way, a terminal status under L0 included, then cleans up exactly
 * what the entry names and clears it.
 *
 * Ported from adt-clients' unit test of the same helper.
 */

import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  AbapGitLedger,
  acquireRunLock,
  cleanUpEntry,
  type ICleanupSteps,
  type ILedgerEntry,
  type IRunRow,
  RunLockHeld,
  RunWaitCancelled,
  readRunLock,
  releasingRunLock,
  runState,
  waitForRun,
} from '../../integration/helpers/abapGitLedger';

/** R1 answering `rows` in turn, the last one for good. */
function scriptedR1(rows: (IRunRow | undefined)[]) {
  let at = 0;
  const reads: (IRunRow | undefined)[] = [];
  return {
    reads,
    read: async (): Promise<IRunRow | undefined> => {
      const row = rows[Math.min(at, rows.length - 1)];
      at += 1;
      reads.push(row);
      return row;
    },
  };
}

const row = (runStatus: string | undefined, appLogKey: string | undefined) => ({
  runStatus,
  appLogKey,
});

const live = () => new AbortController().signal;

describe('the cloud-run correlation', () => {
  it('waits through terminal/L0, R/L0 and terminal/L0 after the submit; ends on terminal/L1', async () => {
    // Before the submit R1 shows a finished earlier run: L0.
    const l0 = 'L0';
    assert.equal(runState(row('S', l0), l0), 'waiting');
    const r1 = scriptedR1([
      row('R', l0),
      row('S', l0),
      row(' ', 'L1'),
      row('R', 'L1'),
      row('W', 'L1'),
    ]);
    const ended = await waitForRun(r1.read, { what: 'pull', l0 }, live());
    assert.deepEqual(ended, { runStatus: 'W', appLogKey: 'L1' });
    assert.equal(r1.reads.length, 5);
  });

  it('takes any log key when there was none before', () => {
    assert.equal(runState(row('E', 'L1'), null), 'terminal');
    assert.equal(runState(row('E', undefined), null), 'waiting');
    assert.equal(runState(row(undefined, 'L1'), null), 'waiting');
    assert.equal(runState(undefined, null), 'gone');
  });

  it('a cancelled wait rejects, naming L0 and the last row', async () => {
    const cancelled = new AbortController();
    const r1 = scriptedR1([row('R', 'L0')]);
    const waiting = waitForRun(
      r1.read,
      { what: 'pull', l0: 'L0' },
      cancelled.signal,
    );
    const rejected = assert.rejects(waiting, RunWaitCancelled);
    cancelled.abort();
    await rejected;
    await assert.rejects(
      waitForRun(r1.read, { what: 'pull', l0: 'L0' }, cancelled.signal),
      /other than L0/,
    );
  });
});

describe('the recovery ledger', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'abapgit-ledger-'));
    file = join(dir, 'ledger.json');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const entry: ILedgerEntry = {
    runId: 'RUN1',
    backend: 'cloud',
    systemKey: 'https://system client=100',
    url: 'https://git.example.invalid/r.git',
    branches: ['b1', 'b2'],
    package: 'ZAGL_RUN1',
    interfaces: ['ZIF_AGL_RUN1'],
    repoKey: 'K1',
    pending: { what: 'pullRepo', l0: 'L0' },
  };

  function recordingSteps(rows: (IRunRow | undefined)[]) {
    const done: string[] = [];
    const remotes: string[] = [];
    const r1 = scriptedR1(rows);
    let linked = true;
    const steps: ICleanupSteps = {
      readRow: async () => (linked ? r1.read() : undefined),
      unlink: async (key) => {
        done.push(`unlink ${key}`);
        linked = false;
      },
      deleteInterface: async (name) => {
        done.push(`interface ${name}`);
      },
      deletePackage: async (name) => {
        done.push(`package ${name}`);
      },
      deleteBranch: async (name, remoteUrl) => {
        done.push(`branch ${name}`);
        remotes.push(remoteUrl);
      },
    };
    return { done, steps, r1, remotes };
  }

  it('an uncorrelated run keeps its fixtures and its entry with the backend and L0', async () => {
    const ledger = new AbapGitLedger(file);
    ledger.put(entry);
    const { done, steps } = recordingSteps([row('R', 'L0')]);
    const cancelled = new AbortController();
    const cleaning = cleanUpEntry(ledger, 'RUN1', steps, cancelled.signal);
    const rejected = assert.rejects(cleaning, RunWaitCancelled);
    cancelled.abort();
    await rejected;
    assert.deepEqual(done, []);
    // A fresh process reads only the file.
    assert.deepEqual(new AbapGitLedger(file).find('RUN1'), entry);
  });

  it('a later run waits past terminal/L0, then cleans up what the entry names and clears it', async () => {
    new AbapGitLedger(file).put(entry);
    const restarted = new AbapGitLedger(file);
    assert.equal(restarted.entriesOf('cloud', entry.systemKey).length, 1);
    assert.deepEqual(restarted.entriesOf('onprem', entry.systemKey), []);
    const { done, steps, r1, remotes } = recordingSteps([
      row('S', 'L0'),
      row('R', 'L1'),
      row('S', 'L1'),
    ]);
    await cleanUpEntry(restarted, 'RUN1', steps, live());
    // Nothing was cleaned up while R1 showed terminal/L0 or R/L1.
    assert.deepEqual(r1.reads.slice(0, 3), [
      row('S', 'L0'),
      row('R', 'L1'),
      row('S', 'L1'),
    ]);
    // Each branch is deleted in the remote the entry recorded.
    assert.deepEqual(remotes, [entry.url, entry.url]);
    assert.deepEqual(done, [
      'unlink K1',
      'interface ZIF_AGL_RUN1',
      'package ZAGL_RUN1',
      'branch b1',
      'branch b2',
    ]);
    assert.deepEqual(new AbapGitLedger(file).entries(), []);
  });

  it('a cleanup cut short resumes where it stopped: what is done is struck from the entry', async () => {
    const ledger = new AbapGitLedger(file);
    ledger.put({ ...entry, pending: undefined });
    const { steps } = recordingSteps([row('S', 'L1')]);
    const failing: ICleanupSteps = {
      ...steps,
      deletePackage: async () => {
        throw new Error('refused');
      },
    };
    await assert.rejects(
      cleanUpEntry(ledger, 'RUN1', failing, live()),
      /refused/,
    );
    const left = new AbapGitLedger(file).find('RUN1');
    assert.equal(left?.repoKey, undefined);
    assert.deepEqual(left?.interfaces, []);
    assert.equal(left?.package, 'ZAGL_RUN1');
    assert.deepEqual(left?.branches, ['b1', 'b2']);
  });

  it('refuses to report an unlink R1 still lists', async () => {
    const ledger = new AbapGitLedger(file);
    ledger.put({ ...entry, pending: undefined });
    const { steps } = recordingSteps([row('S', 'L1')]);
    const ignored: ICleanupSteps = { ...steps, unlink: async () => {} };
    await assert.rejects(
      cleanUpEntry(ledger, 'RUN1', ignored, live()),
      /still listed after unlink/,
    );
    assert.equal(new AbapGitLedger(file).find('RUN1')?.repoKey, 'K1');
  });
});

describe('the run lock', () => {
  let dir: string;
  let file: string;
  const content = { pid: 4242, startedAt: '2026-11-22T10:00:00.000Z' };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'abapgit-lock-'));
    file = join(dir, 'abapgit-live.lock');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('the lock holds its whole content as soon as the file exists, and no temporary file is left', () => {
    const release = acquireRunLock(file, content);
    // The file appears by a hard link of a fully written file: there is no
    // moment it exists empty or half written.
    assert.deepEqual(readRunLock(file), content);
    assert.deepEqual(readdirSync(dir), ['abapgit-live.lock']);
    release();
    assert.equal(existsSync(file), false);
  });

  it('an existing lock refuses, alive or not, naming its file, pid and start; it stays as it was', () => {
    const release = acquireRunLock(file, content);
    let refusal: unknown;
    try {
      acquireRunLock(file, { pid: 5151, startedAt: 'later' });
    } catch (error) {
      refusal = error;
    }
    assert.ok(refusal instanceof RunLockHeld);
    assert.ok(refusal instanceof Error);
    const message = refusal.message;
    assert.ok(message.includes(file));
    assert.ok(message.includes('pid 4242'));
    assert.ok(message.includes('started 2026-11-22T10:00:00.000Z'));
    assert.ok(message.includes('remove'));
    assert.deepEqual(readRunLock(file), content);
    assert.deepEqual(readdirSync(dir), ['abapgit-live.lock']);
    release();
    // A lock no live process holds refuses all the same: no takeover.
    writeFileSync(file, JSON.stringify({ pid: 999999999, startedAt: 'x' }));
    assert.throws(() => acquireRunLock(file, content), RunLockHeld);
  });

  it('the release runs when the teardown throws, and the teardown error is kept', async () => {
    const release = acquireRunLock(file, content);
    await assert.rejects(
      releasingRunLock(release, async () => {
        JSON.parse('not a ledger');
      }),
      SyntaxError,
    );
    assert.equal(existsSync(file), false);
  });
});
