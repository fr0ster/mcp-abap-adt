/**
 * The abapGit live run (plan T6.9, spec §7), shared by the full-tool and
 * the compact suites: one flow, called through the full tools or through
 * `HandlerAbapGitGet` / `HandlerAbapGit` with the action that runs each.
 *
 * **Where it runs.** On premise and on the cloud (`liveSuite`), through an
 * in-process server that holds the run's remote as its one approved
 * endpoint. It skips, saying why, without
 * `~/.config/mcp-abap-adt/sessions/abapgit-live.env` (`ABAPGIT_REPO_URL`,
 * `ABAPGIT_USER`, `ABAPGIT_TOKEN`; the remote a GitHub repository, since the
 * branch fixtures use GitHub's API), where the system answers
 * `abapgit_not_served`, and where the token cannot create branches.
 *
 * **Fixtures, run-owned.** Two branches of an object-empty commit (GitHub's
 * API, the test token), a package and an interface named with the run id.
 * On premise: a local package `$ZAGS<run>`, top level, in software
 * component LOCAL, no request — it deletes completely, where a
 * transportable package keeps every deleted object's directory entry until
 * its request is released (measured in adt-clients' suite, its ERRATA). On
 * the cloud: `ZAGS<run>` under `environment.default_package`, in
 * `shared_dependencies.software_component`, no request. Nothing else is
 * written or deleted.
 *
 * **Recovery** (`abapGitLedger.ts`). The run lock is taken before anything;
 * the ledger's entries of this backend and system are worked first; every
 * fixture is recorded before it is relied on. A cloud job is this run's only
 * once R1 shows a log key other than the one noted before the submit (L0)
 * and a terminal status; its log is then read by that key. A run that
 * cannot correlate keeps its fixtures in the ledger and fails naming them.
 *
 * **The live calls** go through `livePrepare`: the abapGit coverage keys are
 * owed (`coverage-debt.json`) until their pins land, and a `liveCall` of a
 * key with no ledger row is an orphan for the coverage guard.
 *
 * The token is never printed or logged.
 */

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, it, type TestContext } from 'node:test';
import { parseApprovedEndpoints } from '../../../lib/abapGit/approvedEndpoints';
import { parsePackageEntry } from '../../../lib/access/accessLists';
import { listedAccessChecks } from '../../../lib/access/listedAccessChecks';
import { ABAPGIT_ACTION_TOOLS } from '../../../lib/compact/abapGit/definitions';
import type { ToolArgs } from '../../../lib/handlers/interfaces';
import type { ServerRestriction } from '../../helpers/pinServer';
import {
  type AbapGitBackend,
  AbapGitLedger,
  acquireRunLock,
  cleanUpEntry,
  type ICleanupSteps,
  type ILedgerEntry,
  type IRunRow,
  RunWaitCancelled,
  releasingRunLock,
  waitForRun,
} from '../helpers/abapGitLedger';
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
  resolvePackageName,
} from '../helpers/configHelpers';
import {
  type LiveAnswer,
  livePrepare,
  liveSuite,
  throughServer,
  withRestriction,
} from '../helpers/live';

/** How long the run waits for one cloud job: the test's own cancel. */
const CLOUD_RUN_WAIT_MS = Number(
  process.env.ABAPGIT_RUN_WAIT_MS ?? 15 * 60_000,
);

/** Which tools a suite calls: the full ones, or the two compact ones. */
export type AbapGitSet = 'full' | 'compact';

/** The compact tool and action that run `tool`, when it is an abapGit tool. */
function compactCallOf(
  tool: string,
  args: ToolArgs,
): { tool: string; args: ToolArgs } {
  for (const [action, full] of Object.entries(ABAPGIT_ACTION_TOOLS)) {
    if (full !== tool) continue;
    const reads = [
      'ListAbapGitRepos',
      'CheckAbapGitExternalRepo',
      'GetAbapGitModifiedObjects',
      'GetAbapGitStaging',
      'CheckAbapGitRepo',
      'GetAbapGitFile',
      'GetAbapGitErrorLog',
    ];
    return {
      tool: reads.includes(tool) ? 'HandlerAbapGitGet' : 'HandlerAbapGit',
      args: { action, ...args },
    };
  }
  return { tool, args };
}

/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const list = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

/** The answer's JSON, or the case fails naming the step and the answer. */
function json(step: string, answer: LiveAnswer): unknown {
  if (answer.isError) throw new Error(`${step}: ${answer.text.slice(0, 800)}`);
  try {
    return JSON.parse(answer.text);
  } catch {
    throw new Error(`${step} answered no JSON: ${answer.text.slice(0, 800)}`);
  }
}

/** One R1 entry, as `ListAbapGitRepos` with `detail: "full"` answers it. */
interface Repo {
  readonly key: string;
  readonly package: string;
  readonly url: string;
  readonly branchName: string;
  readonly row: IRunRow;
}

function repoOf(entry: unknown): Repo | undefined {
  const key = text(member(entry, 'key'));
  if (key === undefined) return undefined;
  return {
    key,
    package: text(member(entry, 'package')) ?? '',
    url: text(member(entry, 'url')) ?? '',
    branchName: text(member(entry, 'branchName')) ?? '',
    row: {
      runStatus: text(member(entry, 'runStatus')),
      appLogKey: text(member(entry, 'appLogKey')),
    },
  };
}

/**
 * The live run: `liveSuite` on premise and on the cloud, through `set`.
 * `title` names the suite.
 */
export function abapGitLiveRun(set: AbapGitSet, title: string): void {
  const RUN = randomBytes(3).toString('hex').toUpperCase();
  const BRANCH = `abapgit-live-${RUN.toLowerCase()}`;
  const SECOND = `${BRANCH}-b`;
  const INTERFACE = `ZIF_AGS${RUN}`;
  const remoteRead = readRemote();
  const remote: IAbapGitRemote | undefined =
    'missing' in remoteRead ? undefined : remoteRead;
  const backend: AbapGitBackend =
    configuredSystemKind() === 'cloud' ? 'cloud' : 'onprem';
  const PACKAGE = backend === 'cloud' ? `ZAGS${RUN}` : `$ZAGS${RUN}`;
  const endpoints =
    remote === undefined
      ? []
      : parseApprovedEndpoints(
          [{ url: remote.url, user: remote.user, token: remote.token }],
          'the abapGit live remote',
        );
  const ledger = new AbapGitLedger();
  let skipReason: string | undefined =
    'missing' in remoteRead ? remoteRead.missing : undefined;
  let release: (() => void) | undefined;
  let systemKey = '';
  let key: string | undefined;
  /** Set when a run could not be correlated: its fixtures stay. */
  let kept: string | undefined;

  const call = (tool: string, args: ToolArgs): Promise<LiveAnswer> => {
    const sent = set === 'compact' ? compactCallOf(tool, args) : { tool, args };
    return livePrepare(sent.tool, sent.args);
  };

  const skipped = (t: TestContext): boolean => {
    if (skipReason === undefined) return false;
    t.skip(skipReason);
    return true;
  };

  const github = (): GitHubFixtures => {
    if (remote === undefined) throw new Error('no remote');
    return new GitHubFixtures(remote);
  };

  const readRepo = async (repoKey: string): Promise<Repo | undefined> => {
    const facts = json(
      'ListAbapGitRepos',
      await call('ListAbapGitRepos', {
        repository_key: repoKey,
        detail: 'full',
      }),
    );
    return list(member(facts, 'repos'))
      .map(repoOf)
      .find((repo) => repo?.key === repoKey);
  };

  const steps: ICleanupSteps = {
    readRow: async (repoKey) => (await readRepo(repoKey))?.row,
    unlink: async (repoKey) => {
      json(
        'UnlinkAbapGitRepo',
        await call('UnlinkAbapGitRepo', { repository_key: repoKey }),
      );
    },
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
      await github().forUrl(remoteUrl).deleteBranch(name);
    },
  };

  /**
   * A cloud write, correlated: L0 noted and recorded before `submit`, then
   * R1 polled until a new log key and a terminal status; its log read by
   * that key. On premise the write ends in the call.
   */
  const correlated = async (
    what: string,
    submit: () => Promise<LiveAnswer>,
  ): Promise<string | undefined> => {
    const repoKey = key;
    if (repoKey === undefined) throw new Error(`${what}: no repository`);
    if (backend !== 'cloud') {
      const done = json(what, await submit());
      assert.equal(member(done, 'result'), 'done');
      return undefined;
    }
    const l0 = (await readRepo(repoKey))?.row.appLogKey ?? null;
    const pending = { what, l0 };
    ledger.amend(RUN, (entry) => ({ ...entry, pending }));
    const accepted = json(what, await submit());
    assert.equal(member(accepted, 'result'), 'accepted');
    try {
      const ended = await waitForRun(
        steps.readRow.bind(null, repoKey),
        pending,
        AbortSignal.timeout(CLOUD_RUN_WAIT_MS),
      );
      ledger.amend(RUN, (entry) => ({ ...entry, pending: undefined }));
      return ended.appLogKey;
    } catch (error) {
      if (error instanceof RunWaitCancelled) {
        kept = `${what} could not be correlated: ${error.message}`;
      }
      throw error;
    }
  };

  liveSuite(['onprem', 'cloud'], title, () => {
    throughServer(
      async (): Promise<ServerRestriction> => ({ abapGitEndpoints: endpoints }),
    );

    before(async () => {
      if (skipReason !== undefined) return;
      const served = await call('ListAbapGitRepos', { detail: 'full' });
      if (served.text.includes('abapgit_not_served')) {
        skipReason = 'this system does not serve abapGit (its discovery)';
        return;
      }
      const destination = await getTestDestination();
      systemKey = JSON.stringify([
        destination?.settings.url ?? '',
        destination?.settings.client ?? '',
      ]);
      release = acquireRunLock();
      // The ledger first: what an earlier run of this backend and system
      // left, cleaned up exactly as its entry names it.
      for (const entry of ledger.entriesOf(backend, systemKey)) {
        await cleanUpEntry(
          ledger,
          entry.runId,
          steps,
          AbortSignal.timeout(CLOUD_RUN_WAIT_MS),
        );
      }
      const fresh: ILedgerEntry = {
        runId: RUN,
        backend,
        systemKey,
        url: remote?.url ?? '',
        branches: [],
        interfaces: [],
      };
      ledger.put(fresh);
      try {
        const commit = await github().createEmptyCommit();
        for (const branch of [BRANCH, SECOND]) {
          ledger.amend(RUN, (entry) => ({
            ...entry,
            branches: [...entry.branches, branch],
          }));
          await github().createBranch(branch, commit);
        }
      } catch (error) {
        if (error instanceof GitHubRefusal) {
          skipReason = `the token cannot create branches: ${error.message}`;
          return;
        }
        throw error;
      }
      ledger.amend(RUN, (entry) => ({ ...entry, package: PACKAGE }));
      const shared = getSharedDependenciesConfig();
      json(
        'CreatePackage',
        await livePrepare('CreatePackage', {
          package_name: PACKAGE,
          description: 'abapGit live run package',
          package_type: 'development',
          ...(backend === 'cloud'
            ? {
                super_package: resolvePackageName(),
                software_component: shared?.software_component ?? 'ZLOCAL',
              }
            : { software_component: 'LOCAL' }),
        }),
      );
    });

    after(async () => {
      if (release === undefined) return;
      await releasingRunLock(release, async () => {
        if (kept !== undefined) {
          throw new Error(
            `${kept}; its fixtures stay in ${JSON.stringify(ledger.find(RUN))} for the next run`,
          );
        }
        await cleanUpEntry(
          ledger,
          RUN,
          steps,
          AbortSignal.timeout(CLOUD_RUN_WAIT_MS),
        );
        assert.equal(ledger.find(RUN), undefined);
        if (key !== undefined) assert.equal(await readRepo(key), undefined);
        assert.equal(await github().branchExists(BRANCH), false);
        assert.equal(await github().branchExists(SECOND), false);
      });
    });

    it('1. checks the external repository: the run’s branch is listed', async (t) => {
      if (skipped(t)) return;
      const facts = json(
        'CheckAbapGitExternalRepo',
        await call('CheckAbapGitExternalRepo', {
          url: remote?.url ?? '',
          detail: 'full',
        }),
      );
      const names = list(member(facts, 'branches')).map((branch) =>
        text(member(branch, 'name')),
      );
      assert.ok(names.includes(`refs/heads/${BRANCH}`), names.join(', '));
      if (backend === 'cloud') {
        const info = json(
          'GetAbapGitBranchInfo',
          await call('GetAbapGitBranchInfo', {
            url: remote?.url ?? '',
            branch: `refs/heads/${BRANCH}`,
            package_name: PACKAGE,
            detail: 'full',
          }),
        );
        assert.ok(list(member(info, 'branches')).length > 0);
      }
    });

    it('2. links the package on the run’s branch; R1 lists the key with the package, URL and branch', async (t) => {
      if (skipped(t)) return;
      json(
        'LinkAbapGitRepo',
        await call('LinkAbapGitRepo', {
          package_name: PACKAGE,
          url: remote?.url ?? '',
          branch: `refs/heads/${BRANCH}`,
        }),
      );
      const facts = json(
        'ListAbapGitRepos',
        await call('ListAbapGitRepos', {
          package_name: PACKAGE,
          detail: 'full',
        }),
      );
      const linked = list(member(facts, 'repos')).map(repoOf);
      assert.equal(linked.length, 1);
      const repo = linked[0];
      assert.ok(repo !== undefined);
      key = repo.key;
      ledger.amend(RUN, (entry) => ({ ...entry, repoKey: repo.key }));
      assert.equal(repo.package, PACKAGE);
      assert.equal(repo.url, remote?.url);
      assert.equal(repo.branchName, `refs/heads/${BRANCH}`);
    });

    it('3. pushes a run-owned interface the staging shows; the remote branch holds its file', async (t) => {
      if (skipped(t)) return;
      ledger.amend(RUN, (entry) => ({
        ...entry,
        interfaces: [...entry.interfaces, INTERFACE],
      }));
      json(
        'CreateInterface',
        await livePrepare('CreateInterface', {
          interface_name: INTERFACE,
          description: 'abapGit live run interface',
          package_name: PACKAGE,
        }),
      );
      const staging = json(
        'GetAbapGitStaging',
        await call('GetAbapGitStaging', {
          repository_key: key ?? '',
          detail: 'full',
        }),
      );
      const objects = list(member(staging, 'unstaged')).filter(
        (object) => text(member(object, 'name')) === INTERFACE,
      );
      assert.equal(objects.length, 1);
      const pushed = objects.map((object) => ({
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
      const person = {
        name: 'abapGit live run',
        email: 'live@example.invalid',
      };
      const logKey = await correlated('PushAbapGitRepo', () =>
        call('PushAbapGitRepo', {
          repository_key: key ?? '',
          objects: pushed,
          comment: `abapGit live run ${RUN}`,
          author: person,
          committer: person,
        }),
      );
      if (logKey !== undefined) {
        const log = json(
          'GetAbapGitErrorLog',
          await call('GetAbapGitErrorLog', {
            repository_key: key ?? '',
            app_log_key: logKey,
            detail: 'full',
          }),
        );
        assert.ok(Array.isArray(member(log, 'objects')));
      }
      const file = `src/${INTERFACE.toLowerCase()}.intf.abap`;
      assert.ok((await github().readFile(BRANCH, file)) !== undefined, file);
      const remoteFile = await call('GetAbapGitFile', {
        repository_key: key ?? '',
        filename: `${INTERFACE.toLowerCase()}.intf.abap`,
        version: 'remote',
      });
      assert.equal(remoteFile.isError, false, remoteFile.text);
      assert.ok(
        remoteFile.text.toLowerCase().includes(INTERFACE.toLowerCase()),
      );
    });

    it('4. pulls a change made in the remote; the interface’s source changed in SAP', async (t) => {
      if (skipped(t)) return;
      const path = `src/${INTERFACE.toLowerCase()}.intf.abap`;
      const before = await github().readFile(BRANCH, path);
      assert.ok(before !== undefined);
      const marker = `"abapGit live run ${RUN}`;
      await github().writeFile(
        BRANCH,
        path,
        `${before.text.trimEnd()}\n${marker}\n`,
        before.sha,
        `abapGit live run ${RUN}: a remote change`,
      );
      if (backend === 'cloud') {
        json(
          'GetAbapGitModifiedObjects',
          await call('GetAbapGitModifiedObjects', {
            repository_key: key ?? '',
            detail: 'full',
          }),
        );
      }
      await correlated('PullAbapGitRepo', () =>
        call('PullAbapGitRepo', { repository_key: key ?? '' }),
      );
      const source = await livePrepare('GetInterface', {
        interface_name: INTERFACE,
        ...(backend === 'cloud' ? { version: 'inactive' } : {}),
      });
      assert.equal(source.isError, false, source.text);
      assert.ok(source.text.includes(marker), 'the pulled change is in SAP');
    });

    it('5. on premise: switches to the second branch and back; R1’s branch follows', async (t) => {
      if (skipped(t)) return;
      if (backend !== 'onprem') return t.skip('the switch is on premise only');
      for (const branch of [SECOND, BRANCH]) {
        json(
          'SwitchAbapGitBranch',
          await call('SwitchAbapGitBranch', {
            repository_key: key ?? '',
            branch: `refs/heads/${branch}`,
            create: false,
          }),
        );
        assert.equal(
          (await readRepo(key ?? ''))?.branchName,
          `refs/heads/${branch}`,
        );
      }
    });

    it('6. runs the checks and reads the file local and remote; a missing file carries SAP’s T100 key', async (t) => {
      if (skipped(t)) return;
      const checks = await call('CheckAbapGitRepo', {
        repository_key: key ?? '',
      });
      // On premise SAP answers SYNTAX_ERROR here (measured): either answer
      // is SAP's own.
      assert.ok(checks.text.length > 0);
      for (const version of ['local', 'remote']) {
        const file = await call('GetAbapGitFile', {
          repository_key: key ?? '',
          filename: `${INTERFACE.toLowerCase()}.intf.abap`,
          version,
        });
        assert.equal(file.isError, false, `${version}: ${file.text}`);
      }
      const missing = await call('GetAbapGitFile', {
        repository_key: key ?? '',
        filename: `zif_none_${RUN.toLowerCase()}.intf.abap`,
        version: 'remote',
      });
      assert.equal(missing.isError, true);
      const facts = member(JSON.parse(missing.text), 'facts');
      assert.equal(typeof member(facts, 'messageClass'), 'string');
      assert.equal(typeof member(facts, 'messageNumber'), 'string');
    });

    withRestriction(
      '7. under an allowed-packages entry naming the run’s package',
      async (): Promise<ServerRestriction> => ({
        abapGitEndpoints: endpoints,
        abapGitRestrictions: { packages: true, requests: false },
        accessChecks: listedAccessChecks({
          allowedPackages: [parsePackageEntry(PACKAGE, 'allowed-packages')],
        }),
      }),
      () => {
        it('link and pull are refused with nothing sent; switch is checked against the repository’s package', async (t) => {
          if (skipped(t)) return;
          for (const [tool, args] of [
            [
              'LinkAbapGitRepo',
              {
                package_name: PACKAGE,
                url: remote?.url ?? '',
                branch: `refs/heads/${BRANCH}`,
              },
            ],
            ['PullAbapGitRepo', { repository_key: key ?? '' }],
          ] as const) {
            const refused = await call(tool, args);
            assert.equal(refused.isError, true);
            assert.match(refused.text, /abapgit_import_not_allowed/);
          }
          if (backend === 'onprem') {
            json(
              'SwitchAbapGitBranch',
              await call('SwitchAbapGitBranch', {
                repository_key: key ?? '',
                branch: `refs/heads/${BRANCH}`,
                create: false,
              }),
            );
          }
        });
      },
    );

    withRestriction(
      '7. under an allowed-packages entry naming another package',
      async (): Promise<ServerRestriction> => ({
        abapGitEndpoints: endpoints,
        abapGitRestrictions: { packages: true, requests: false },
        accessChecks: listedAccessChecks({
          allowedPackages: [
            parsePackageEntry(`ZAGS_NONE${RUN}`, 'allowed-packages'),
          ],
        }),
      }),
      () => {
        it('push and unlink are refused by the repository’s package', async (t) => {
          if (skipped(t)) return;
          for (const [tool, args] of [
            [
              'PushAbapGitRepo',
              {
                repository_key: key ?? '',
                objects: [],
                comment: 'refused',
                author: { name: 'n', email: 'n@example.invalid' },
                committer: { name: 'n', email: 'n@example.invalid' },
              },
            ],
            ['UnlinkAbapGitRepo', { repository_key: key ?? '' }],
          ] as const) {
            const refused = await call(tool, args);
            assert.equal(refused.isError, true);
            assert.match(refused.text, /package_not_allowed/);
          }
        });
      },
    );
  });
}
