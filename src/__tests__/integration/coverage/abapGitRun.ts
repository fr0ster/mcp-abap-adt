/**
 * The abapGit live run (plan T6.9, spec §7), shared by the full-tool and
 * the compact suites: the fixtures, the recovery and the cloud-job
 * correlation. The calls under test are the suites' own — each a literal
 * `liveCall` in a case (`abapGit.live.test.ts`, `abapGitCompact.live.test.ts`),
 * so a live run records each abapGit key; everything here prepares, reads
 * back or cleans up through `livePrepare`, its key not recorded.
 *
 * **Where it runs.** On premise and on the cloud, through an in-process
 * server that holds the run's remote as its one approved endpoint. A case
 * skips, saying why, without `~/.config/mcp-abap-adt/sessions/abapgit-live.env`
 * (`ABAPGIT_REPO_URL`, `ABAPGIT_USER`, `ABAPGIT_TOKEN`; the remote a GitHub
 * repository, since the branch fixtures use GitHub's API), where the system
 * answers `abapgit_not_served`, where the token cannot create branches, and
 * on the backend a step is not served on.
 *
 * **Only what the run created** (`abapGitLedger.ts`). The run lock is taken
 * before anything; the ledger's entries of this backend and system — the
 * system by its effective identity (`systemIdentityOf`: an RFC destination
 * by its name, server, system number and client; HTTP by URL and client) —
 * are worked first. Every name is read free before its create, every create
 * journaled before its write and settled after it; a link is journaled with
 * its package and remote before it is sent, and R1's entry is checked
 * against the ledger before any unlink. Two branches of an object-empty
 * commit (GitHub's API, the test token), a package and an interface named
 * with the run id. On premise: a local package `$ZAGS<run>`, top level, in
 * software component LOCAL, no request — it deletes completely, where a
 * transportable package keeps every deleted object's directory entry until
 * its request is released (measured in adt-clients' suite, its ERRATA). On
 * the cloud: `ZAGS<run>` under `environment.default_package`, in
 * `shared_dependencies.software_component`, no request.
 *
 * **A cloud job** is opened in the ledger with R1's log key before the
 * submit (L0), one at a time, and is this run's only once R1 shows another
 * log key and a terminal status; its log is then read by that key. The wait
 * has no bound: it ends on SAP's answer or the runner's stop request. Only
 * the route's definite refusal (its T100 key) closes the job unseen; a run
 * that cannot correlate keeps its fixtures in the ledger and fails naming
 * them.
 *
 * The token is never printed or logged.
 */

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, type TestContext } from 'node:test';
import { ABAPGIT_ERROR_MESSAGES } from '@mcp-abap-adt/interfaces-adt';
import {
  type ApprovedEndpoint,
  parseApprovedEndpoints,
} from '../../../lib/abapGit/approvedEndpoints';
import { parsePackageEntry } from '../../../lib/access/accessLists';
import { listedAccessChecks } from '../../../lib/access/listedAccessChecks';
import type { ServerRestriction } from '../../helpers/pinServer';
import {
  type AbapGitBackend,
  AbapGitLedger,
  acquireRunLock,
  cleanUpEntry,
  createFixture,
  type FixtureKind,
  type ICleanupSteps,
  type IPendingRun,
  type IRepoRow,
  isRouteRefusal,
  RunWaitCancelled,
  releasingRunLock,
  repoRowOf,
  systemIdentityOf,
  type WriteOutcome,
  waitForRun,
} from '../helpers/abapGitLedger';
import {
  actionsOf,
  interfaceSource,
  overwriteOf,
  succeeded,
  swapMarker,
} from '../helpers/abapGitPull';

/** `IF_ABAPGIT_OBJECTS=>c_deserialize_action` (cloud, read 2026-11-23). */
const ACTION_UPDATE = 2;
const ACTION_OVERWRITE = 3;

import { stopSignalOf } from '../../helpers/stopSignal';
import {
  GitHubFixtures,
  GitHubRefusal,
  type IAbapGitRemote,
  readRemote,
} from '../helpers/abapGitRemote';
import { getTestDestination } from '../helpers/authHelpers';
import {
  configuredSystemKind,
  getSharedDependenciesConfig,
  loadTestConfig,
  resolvePackageName,
} from '../helpers/configHelpers';
import {
  expectNameFree,
  isNotFound,
  type LiveAnswer,
  livePrepare,
  throughServer,
} from '../helpers/live';

/** A member of a JSON value, read by shape. */
export function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

export const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export const list = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

/** The answer's JSON, or the case fails naming the step and the answer. */
export function json(step: string, answer: LiveAnswer): unknown {
  if (answer.isError) throw new Error(`${step}: ${answer.text.slice(0, 800)}`);
  try {
    return JSON.parse(answer.text);
  } catch {
    throw new Error(`${step} answered no JSON: ${answer.text.slice(0, 800)}`);
  }
}

/** One R1 entry, as `ListAbapGitRepos` with `detail: "full"` answers it. */
export function repoOf(entry: unknown): IRepoRow | undefined {
  const key = text(member(entry, 'key'));
  if (key === undefined) return undefined;
  return {
    key,
    package: text(member(entry, 'package')) ?? '',
    url: text(member(entry, 'url')) ?? '',
    branchName: text(member(entry, 'branchName')) ?? '',
    runStatus: text(member(entry, 'runStatus')),
    appLogKey: text(member(entry, 'appLogKey')),
  };
}

/** The R1 entries of a `ListAbapGitRepos` answer at `detail: "full"`. */
export function reposOf(step: string, answer: LiveAnswer): IRepoRow[] {
  return list(member(json(step, answer), 'repos')).flatMap((entry) => {
    const repo = repoOf(entry);
    return repo === undefined ? [] : [repo];
  });
}

/** The names of the branches a `CheckAbapGitExternalRepo` answer lists. */
export function branchNamesOf(step: string, answer: LiveAnswer): string[] {
  return list(member(json(step, answer), 'branches')).flatMap((branch) => {
    const name = text(member(branch, 'name'));
    return name === undefined ? [] : [name];
  });
}

/** What a push sends for the staging's unstaged objects named `name`. */
export function pushedObjectsOf(staging: unknown, name: string) {
  return list(member(staging, 'unstaged'))
    .filter((object) => text(member(object, 'name')) === name)
    .map((object) => ({
      wbkey: text(member(object, 'wbkey')) ?? '',
      version: text(member(object, 'version')) ?? '',
      uri: text(member(object, 'uri')) ?? '',
      type: text(member(object, 'type')) ?? '',
      name: text(member(object, 'name')) ?? '',
      package_name: text(member(object, 'packageName')) ?? '',
      files: list(member(object, 'files')).map((file) => ({
        name: text(member(file, 'name')) ?? '',
        path: text(member(file, 'path')) ?? '',
        local_state: text(member(file, 'localState')) ?? '',
        remote_state: text(member(file, 'remoteState')) ?? '',
      })),
    }));
}

/**
 * The remote file read without a credential, refused with SAP's T100 key:
 * SAP reads the private remote anonymously, the git host refuses, and the
 * abapGit exception is answered 500 with T100 00/001 (onprem
 * `ZCL_ABAPGIT_RES_REPO_FILES->get` L84–87, cloud L97–100; measured
 * 2026-11-22 on both systems, adt-clients ERRATA). Not a file the
 * repository does not hold: that read answers 200 with an empty text
 * (L69 / L80, measured on premise). The facts are asserted whole.
 */
export function assertAnonymousFileT100(answer: LiveAnswer): void {
  assert.equal(answer.isError, true, answer.text);
  assert.deepEqual(member(JSON.parse(answer.text), 'facts'), {
    status: 500,
    messageClass: '00',
    messageNumber: '001',
  });
}

/**
 * Whether this run's system is the one whose abapGit cannot answer the
 * checks: on premise, and the system `abapgit.check_repo_fault_system`
 * names, matched against `environment.default_master_system`. Anywhere else
 * the checks must answer.
 */
export function checksFaultHere(backend: AbapGitBackend): boolean {
  const config = loadTestConfig();
  const fault = (config.abapgit?.check_repo_fault_system ?? '').trim();
  const system = (config.environment?.default_master_system ?? '').trim();
  return backend === 'onprem' && fault !== '' && fault === system;
}

/**
 * On the system `checksFaultHere` names, the checks are SAP's handler
 * fault: every call ends in
 * SYNTAX_ERROR in `ZCL_ABAPGIT_RES_REPO_CHECKS` (no value for the mandatory
 * `IV_SERVICE` at L53; measured 2026-11-22, adt-clients ERRATA), answered
 * 500 with no T100 key. The answer is asserted whole — the fixed refused
 * words and the status alone — so a 500 that carries anything more, or any
 * other refusal, fails. The facts cannot name the dump: this is what the
 * measured fault answers, not proof of it.
 */
export function assertOnpremChecksFault(answer: LiveAnswer): void {
  assert.equal(answer.isError, true, answer.text);
  assert.deepEqual(JSON.parse(answer.text), {
    message: ABAPGIT_ERROR_MESSAGES.refused,
    facts: { status: 500 },
  });
}

/** The person a push names as author and committer. */
export const PERSON = {
  name: 'abapGit live run',
  email: 'live@example.invalid',
} as const;

/** A wait the runner's stop request ends, and nothing else. */
async function untilStopped<T>(
  wait: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const stop = stopSignalOf(process.env.MCP_ABAP_ADT_STOP_FILE);
  try {
    return await wait(stop.signal);
  } finally {
    stop.close();
  }
}

/**
 * One live run's fixtures, ledger and correlation. `install()` is called
 * in a `liveSuite` body; its cases call the tools under test themselves.
 */
export class AbapGitRun {
  readonly runId = randomBytes(3).toString('hex').toUpperCase();
  readonly backend: AbapGitBackend =
    configuredSystemKind() === 'cloud' ? 'cloud' : 'onprem';
  private readonly branchName = `abapgit-live-${this.runId.toLowerCase()}`;
  private readonly secondName = `${this.branchName}-b`;
  readonly interfaceName = `ZIF_AGS${this.runId}`;
  /** The second run interface: changed locally with the first, left out of the selection. */
  readonly secondInterface = `ZIF_AGS${this.runId}B`;
  /** Both run interfaces, created and pushed together. */
  get interfaceNames(): readonly string[] {
    return [this.interfaceName, this.secondInterface];
  }
  readonly packageName =
    this.backend === 'cloud' ? `ZAGS${this.runId}` : `$ZAGS${this.runId}`;
  private readonly remote: IAbapGitRemote | undefined;
  private readonly endpoints: readonly ApprovedEndpoint[];
  private readonly ledger = new AbapGitLedger();
  private skipReason: string | undefined;
  private release: (() => void) | undefined;
  private repoKey: string | undefined;
  private logKey: string | undefined;
  /** Set when a run could not be correlated: its fixtures stay. */
  private kept: string | undefined;

  constructor() {
    const read = readRemote();
    this.remote = 'missing' in read ? undefined : read;
    this.skipReason = 'missing' in read ? read.missing : undefined;
    this.endpoints =
      this.remote === undefined
        ? []
        : parseApprovedEndpoints(
            [
              {
                url: this.remote.url,
                user: this.remote.user,
                token: this.remote.token,
              },
            ],
            'the abapGit live remote',
          );
  }

  /** The remote URL SAP is given. */
  get url(): string {
    return this.remote?.url ?? '';
  }

  /** The run's branch, as SAP names it. */
  get branch(): string {
    return `refs/heads/${this.branchName}`;
  }

  /** The run's second branch, as SAP names it. */
  get second(): string {
    return `refs/heads/${this.secondName}`;
  }

  /** The linked repository's key; a case before the link fails. */
  key(): string {
    if (this.repoKey === undefined) throw new Error('no repository linked');
    return this.repoKey;
  }

  /** The log key of the run's last cloud job; a case before one fails. */
  lastLogKey(): string {
    if (this.logKey === undefined) throw new Error('no cloud job has ended');
    return this.logKey;
  }

  /** The interface's file name in the repository. */
  get fileName(): string {
    return this.fileOf(this.interfaceName);
  }

  /** An interface's file name in the repository. */
  fileOf(name: string): string {
    return `${name.toLowerCase()}.intf.abap`;
  }

  /** Skips `t` with the run's reason, when there is one. */
  skipped(t: TestContext): boolean {
    if (this.skipReason === undefined) return false;
    t.skip(this.skipReason);
    return true;
  }

  /** Skips `t` unless the system is `backend`, or with the run's reason. */
  skippedUnless(t: TestContext, backend: AbapGitBackend): boolean {
    if (this.skipped(t)) return true;
    if (this.backend === backend) return false;
    t.skip(`this step runs on ${backend} only`);
    return true;
  }

  private github(): GitHubFixtures {
    if (this.remote === undefined) throw new Error('no remote');
    return new GitHubFixtures(this.remote);
  }

  /** R1, whole; it throws when R1 cannot be read. */
  private async listRepos(): Promise<IRepoRow[]> {
    return reposOf(
      'ListAbapGitRepos',
      await livePrepare('ListAbapGitRepos', { detail: 'full' }),
    );
  }

  /** Whether `name` of `kind` exists: a definite answer, else it throws. */
  private async exists(
    kind: FixtureKind,
    name: string,
    remoteUrl: string,
  ): Promise<boolean> {
    if (kind === 'branch') {
      return this.github().forUrl(remoteUrl).branchExists(name);
    }
    const answer =
      kind === 'package'
        ? await livePrepare('GetPackage', { package_name: name })
        : await livePrepare('GetInterface', { interface_name: name });
    if (!answer.isError) return true;
    if (isNotFound(answer)) return false;
    throw new Error(
      `${kind} ${name} cannot be read: ${answer.text.slice(0, 400)}`,
    );
  }

  private readonly steps: ICleanupSteps = {
    listRepos: () => this.listRepos(),
    unlink: async (repoKey) => {
      json(
        'UnlinkAbapGitRepo',
        await livePrepare('UnlinkAbapGitRepo', { repository_key: repoKey }),
      );
    },
    exists: (kind, name, remoteUrl) => this.exists(kind, name, remoteUrl),
    deleteInterface: async (name, transportRequest) => {
      const answer = await livePrepare('DeleteInterface', {
        interface_name: name,
        ...(transportRequest !== undefined
          ? { transport_request: transportRequest }
          : {}),
      });
      if (answer.isError) throw new Error(`DeleteInterface: ${answer.text}`);
    },
    deletePackage: async (name, transportRequest) => {
      const answer = await livePrepare('DeletePackage', {
        package_name: name,
        ...(transportRequest !== undefined
          ? { transport_request: transportRequest }
          : {}),
      });
      if (answer.isError) throw new Error(`DeletePackage: ${answer.text}`);
    },
    deleteBranch: async (name, remoteUrl) => {
      await this.github().forUrl(remoteUrl).deleteBranch(name);
    },
  };

  /** An SAP create through `tool`, journaled; SAP's answer settles it. */
  private async createInSap(
    kind: 'package' | 'interface',
    name: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    const outcome = await createFixture(
      this.ledger,
      this.runId,
      kind,
      name,
      async (): Promise<WriteOutcome> => {
        const answer = await livePrepare(tool, args);
        return answer.isError ? 'refused' : 'confirmed';
      },
    );
    if (outcome === 'refused') {
      throw new Error(`${tool} refused ${name}: nothing of it is deleted`);
    }
  }

  /** The marker the run's interface holds at `version`. */
  marker(version: 'v1' | 'v2' | 'v3' | 'l1'): string {
    return `abapGit live run ${this.runId} ${version}`;
  }

  /**
   * Creates both run interfaces in the run's package, each name read free
   * first, then writes each source at `v1` and activates it — the objects
   * in sync before their push, so a remote change is the remote's only
   * (`abapGitPull.ts`).
   */
  async createInterfaces(): Promise<void> {
    for (const name of this.interfaceNames) {
      await expectNameFree({
        tool: 'GetInterface',
        args: { interface_name: name },
      });
      await this.createInSap('interface', name, 'CreateInterface', {
        interface_name: name,
        description: 'abapGit live run interface',
        package_name: this.packageName,
      });
      const written = await livePrepare('UpdateInterface', {
        interface_name: name,
        source_code: interfaceSource(name, this.marker('v1')),
        activate: true,
      });
      assert.equal(written.isError, false, written.text);
    }
  }

  /** The server's restriction: the run's remote, and what a case adds. */
  restriction(over: ServerRestriction = {}): ServerRestriction {
    return { abapGitEndpoints: this.endpoints, ...over };
  }

  /**
   * No approved endpoint: every abapGit request goes without a credential
   * (no remote matches), so SAP reads the private remote anonymously.
   */
  anonymousRestriction(): ServerRestriction {
    return this.restriction({ abapGitEndpoints: [] });
  }

  /** Link and pull refused (the import refusal), switch checked against the run's package. */
  ownPackageRestriction(): ServerRestriction {
    return this.restriction({
      abapGitRestrictions: { packages: true, requests: false },
      accessChecks: listedAccessChecks({
        allowedPackages: [
          parsePackageEntry(this.packageName, 'allowed-packages'),
        ],
      }),
    });
  }

  /** Push and unlink refused by the repository's package. */
  otherPackageRestriction(): ServerRestriction {
    return this.restriction({
      abapGitRestrictions: { packages: true, requests: false },
      accessChecks: listedAccessChecks({
        allowedPackages: [
          parsePackageEntry(`ZAGS_NONE${this.runId}`, 'allowed-packages'),
        ],
      }),
    });
  }

  /** The link, journaled with its package, remote and branch before it is sent. */
  journalLink(): void {
    this.ledger.journalLink(this.runId, {
      package: this.packageName,
      url: this.url,
      branch: this.branch,
    });
  }

  /** The link is R1's one entry of the run's package (a `ListAbapGitRepos` answer). */
  confirmLink(listed: LiveAnswer): void {
    const linked = reposOf('ListAbapGitRepos', listed);
    assert.equal(linked.length, 1);
    const [repo] = linked;
    assert.ok(repo !== undefined);
    assert.equal(repo.package, this.packageName);
    assert.equal(repo.url, this.url);
    assert.equal(repo.branchName, this.branch);
    this.ledger.confirmLink(this.runId, repo.key);
    this.repoKey = repo.key;
  }

  /** The linked repository is on `branch` now, as R1 and the ledger say. */
  async followBranch(branch: string): Promise<void> {
    this.ledger.followBranch(this.runId, branch);
    assert.equal((await this.ownRepo())?.branchName, branch);
  }

  /** R1's entry of the run's repository. */
  async ownRepo(): Promise<IRepoRow | undefined> {
    return repoRowOf(this.steps, this.key());
  }

  /** R1's entry is the ledger's: its package, remote and branch, before an unlink. */
  async assertOwnRepo(): Promise<void> {
    const repo = await this.ownRepo();
    const link = this.ledger.find(this.runId)?.link;
    assert.ok(repo !== undefined && link !== undefined);
    assert.deepEqual(
      [repo.package, repo.url, repo.branchName],
      [link.package, link.url, link.branch],
    );
  }

  /** The repository is unlinked: R1 no longer lists it. */
  async unlinked(answer: LiveAnswer): Promise<void> {
    json('UnlinkAbapGitRepo', answer);
    assert.equal(await this.ownRepo(), undefined);
    this.ledger.amend(this.runId, (entry) => ({ ...entry, link: undefined }));
    this.repoKey = undefined;
  }

  /**
   * Opens a cloud job before its submit — R1's log key now is L0 — refused
   * while one is open; on premise there is none to open.
   */
  async openJob(what: string): Promise<IPendingRun | undefined> {
    if (this.backend !== 'cloud') return undefined;
    const pending: IPendingRun = {
      what,
      l0: (await this.ownRepo())?.appLogKey ?? null,
    };
    this.ledger.openPending(this.runId, pending);
    return pending;
  }

  /**
   * The submit's answer, correlated. On premise the write ended in the
   * call (`done`). On the cloud: the route's definite refusal closes the
   * job; any other failure keeps it for the next run; `accepted` is waited
   * for until R1 shows a new log key and a terminal status, or the runner's
   * stop request.
   */
  async endJob(
    what: string,
    pending: IPendingRun | undefined,
    answer: LiveAnswer,
  ): Promise<void> {
    if (pending === undefined) {
      assert.equal(member(json(what, answer), 'result'), 'done');
      return;
    }
    if (answer.isError) {
      if (isRouteRefusal(answer)) this.ledger.closePending(this.runId);
      else this.kept = `${what} answered no definite refusal`;
      throw new Error(`${what}: ${answer.text.slice(0, 800)}`);
    }
    if (member(json(what, answer), 'result') !== 'accepted') {
      this.kept = `${what} was not accepted`;
      throw new Error(`${what}: ${answer.text.slice(0, 800)}`);
    }
    const repoKey = this.key();
    try {
      const ended = await untilStopped((signal) =>
        waitForRun(() => repoRowOf(this.steps, repoKey), pending, signal),
      );
      this.ledger.closePending(this.runId);
      this.logKey = ended.appLogKey;
      assert.ok(
        succeeded(ended.runStatus),
        `${what} ended with status ${ended.runStatus ?? '(none)'} (log key ${ended.appLogKey})`,
      );
    } catch (error) {
      if (error instanceof RunWaitCancelled) {
        this.kept = `${what} could not be correlated: ${error.message}`;
      }
      throw error;
    }
  }

  /** The remote branch holds each run interface's file. */
  async assertPushed(): Promise<void> {
    for (const name of this.interfaceNames) {
      const path = `src/${this.fileOf(name)}`;
      assert.ok(
        (await this.github().readFile(this.branchName, path)) !== undefined,
        path,
      );
    }
  }

  /**
   * Changes the interface's file in the remote from `from` to `to`, the
   * constant's value only; answers the `to` marker.
   */
  async changeRemote(
    from: 'v1' | 'v2' = 'v1',
    to: 'v2' | 'v3' = 'v2',
    name: string = this.interfaceName,
  ): Promise<string> {
    const path = `src/${this.fileOf(name)}`;
    const before = await this.github().readFile(this.branchName, path);
    assert.ok(before !== undefined, path);
    const marker = this.marker(to);
    await this.github().writeFile(
      this.branchName,
      path,
      swapMarker(before.text, this.marker(from), marker),
      before.sha,
      `abapGit live run ${this.runId}: a remote change`,
    );
    return marker;
  }

  /**
   * R6's facts (`detail: "full"`) list the run interface once, with the
   * action `update` (2): changed only in the remote
   * (`CL_ABAPGIT_OBJECTS_CHECK=>warning_overwrite_find` L161–178, `' M'`;
   * `abapGitPull.ts`).
   */
  assertRemoteOnly(facts: unknown): void {
    assert.deepEqual(
      actionsOf(facts, this.interfaceName),
      [ACTION_UPDATE],
      'R6 lists the run interface once as update (changed only in the remote)',
    );
    assert.deepEqual(
      actionsOf(facts, this.secondInterface),
      [],
      'R6 lists the unchanged second interface',
    );
  }

  /**
   * R6's facts (`detail: "full"`) list the run interface once, with the
   * action `overwrite` (3): changed locally (`'MM'`, L161–178); answers the
   * `overwrite` that selects it, its type and name as R6 answered them.
   */
  overwriteChangedLocally(facts: unknown): { type: string; name: string }[] {
    for (const name of this.interfaceNames) {
      assert.deepEqual(
        actionsOf(facts, name),
        [ACTION_OVERWRITE],
        `R6 lists ${name} once as overwrite (changed locally)`,
      );
    }
    return overwriteOf(facts, this.interfaceName);
  }

  /** Writes `name` in SAP at `l1` and activates it: a local change. */
  async changeLocally(name: string = this.interfaceName): Promise<void> {
    const written = await livePrepare('UpdateInterface', {
      interface_name: name,
      source_code: interfaceSource(name, this.marker('l1')),
      activate: true,
    });
    assert.equal(written.isError, false, written.text);
  }

  /**
   * `name`, left out of the selection, keeps its local change: both its
   * inactive and its active source hold `l1`, none the remote's `v2`
   * (`CL_ABAPGIT_OBJECTS->warning_overwrite_adjust` L1791: an unselected
   * entry changed locally is dropped from the import).
   */
  async assertKeptLocal(name: string): Promise<void> {
    for (const version of ['inactive', 'active'] as const) {
      const source = await livePrepare('GetInterface', {
        interface_name: name,
        version,
      });
      assert.equal(source.isError, false, source.text);
      assert.ok(
        source.text.includes(this.marker('l1')) &&
          !source.text.includes(this.marker('v2')),
        `${name} (${version}) keeps its local change`,
      );
    }
  }

  /**
   * The pulled change is in SAP. On premise the pull activates: the active
   * source holds it. On the cloud the pull imports inactive
   * (`CL_ABAPGIT_OBJECTS` L1127–1133; Code; adt-clients ERRATA, measured
   * 2026-11-22): the inactive version holds it, the active one still
   * `active` (the pushed `v1` by default).
   */
  async assertPulled(
    marker: string,
    active: 'v1' | 'l1' = 'v1',
  ): Promise<void> {
    const read = async (version: 'active' | 'inactive') => {
      const source = await livePrepare('GetInterface', {
        interface_name: this.interfaceName,
        version,
      });
      assert.equal(source.isError, false, source.text);
      return source.text;
    };
    if (this.backend === 'onprem') {
      assert.ok(
        (await read('active')).includes(marker),
        'the pulled change is active',
      );
      return;
    }
    assert.ok(
      (await read('inactive')).includes(marker),
      'the pulled change is the inactive version',
    );
    assert.ok(
      (await read('active')).includes(this.marker(active)),
      'the active version is still the one before the pull',
    );
  }

  /** A branch create, its name read free first and the create journaled. */
  private async createBranch(name: string, commit: string): Promise<void> {
    if (await this.github().branchExists(name)) {
      throw new Error(`branch ${name} exists: nothing is created`);
    }
    let refusal = '';
    const outcome = await createFixture(
      this.ledger,
      this.runId,
      'branch',
      name,
      async (): Promise<WriteOutcome> => {
        try {
          await this.github().createBranch(name, commit);
          return 'confirmed';
        } catch (error) {
          if (error instanceof GitHubRefusal) {
            refusal = error.message;
            return 'refused';
          }
          throw error;
        }
      },
    );
    if (outcome === 'refused') {
      this.skipReason = `the token cannot create branches: ${refusal}`;
    }
  }

  /**
   * The server with the run's remote approved, the run lock, the ledger's
   * recovery, the fixtures; after the cases, the cleanup. Call it in a
   * `liveSuite` body.
   */
  install(): void {
    throughServer(async () => this.restriction());

    before(async () => {
      if (this.skipReason !== undefined) return;
      const served = await livePrepare('ListAbapGitRepos', { detail: 'full' });
      if (served.text.includes('abapgit_not_served')) {
        this.skipReason = 'this system does not serve abapGit (its discovery)';
        return;
      }
      const destination = await getTestDestination();
      if (destination === null) {
        this.skipReason = 'no destination is configured';
        return;
      }
      const systemKey = systemIdentityOf(
        destination.destination,
        destination.settings,
      );
      this.release = acquireRunLock();
      // The ledger first: what an earlier run of this backend and system
      // left, cleaned up exactly as its entry names it.
      for (const entry of this.ledger.entriesOf(this.backend, systemKey)) {
        await untilStopped((signal) =>
          cleanUpEntry(this.ledger, entry.runId, this.steps, signal),
        );
      }
      this.ledger.put({
        runId: this.runId,
        backend: this.backend,
        systemKey,
        url: this.url,
        fixtures: [],
      });
      const commit = await this.github().createEmptyCommit();
      for (const name of [this.branchName, this.secondName]) {
        await this.createBranch(name, commit);
        if (this.skipReason !== undefined) return;
      }
      await expectNameFree({
        tool: 'GetPackage',
        args: { package_name: this.packageName },
      });
      const shared = getSharedDependenciesConfig();
      await this.createInSap('package', this.packageName, 'CreatePackage', {
        package_name: this.packageName,
        description: 'abapGit live run package',
        package_type: 'development',
        ...(this.backend === 'cloud'
          ? {
              super_package: resolvePackageName(),
              software_component: shared?.software_component ?? 'ZLOCAL',
            }
          : { software_component: 'LOCAL' }),
      });
    });

    after(async () => {
      const release = this.release;
      if (release === undefined) return;
      await releasingRunLock(release, async () => {
        if (this.kept !== undefined) {
          throw new Error(
            `${this.kept}; its fixtures stay in ${JSON.stringify(this.ledger.find(this.runId))} for the next run`,
          );
        }
        const key = this.repoKey;
        await untilStopped((signal) =>
          cleanUpEntry(this.ledger, this.runId, this.steps, signal),
        );
        assert.equal(this.ledger.find(this.runId), undefined);
        if (key !== undefined) {
          assert.equal(await repoRowOf(this.steps, key), undefined);
        }
        assert.equal(await this.github().branchExists(this.branchName), false);
        assert.equal(await this.github().branchExists(this.secondName), false);
      });
    });
  }
}
