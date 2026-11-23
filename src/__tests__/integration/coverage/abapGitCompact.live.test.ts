/**
 * abapGit live, compact (plan T6.9): every `HandlerAbapGitGet` and
 * `HandlerAbapGit` action, each in the step its full tool runs in
 * `abapGit.live.test.ts`, on the same run-owned fixtures, T100 and recovery
 * cases. On premise and on the cloud; each call under test a `liveCall` of
 * its action's key. The fixtures, the recovery and the cloud-job
 * correlation: `abapGitRun.ts`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { liveCall, liveSuite, throughServer } from '../helpers/live';
import {
  AbapGitRun,
  assertAnonymousFileT100,
  assertOnpremChecksFault,
  branchNamesOf,
  checksFaultHere,
  json,
  list,
  member,
  PERSON,
  pushedObjectsOf,
} from './abapGitRun';

const run = new AbapGitRun();
let marker = '';

liveSuite(['onprem', 'cloud'], 'abapGit, compact', () => {
  run.install();

  it('1. checks the external repository: the run’s branch is listed', async (t) => {
    if (run.skipped(t)) return;
    const answer = await liveCall('HandlerAbapGitGet', {
      action: 'external_repo',
      url: run.url,
      detail: 'full',
    });
    const names = branchNamesOf('CheckAbapGitExternalRepo', answer);
    assert.ok(names.includes(run.branch), names.join(', '));
  });

  it('1b. on the cloud: reads the branch info of the run’s branch', async (t) => {
    if (run.skippedUnless(t, 'cloud')) return;
    const answer = await liveCall('HandlerAbapGit', {
      action: 'branch_info',
      url: run.url,
      branch: run.branch,
      package_name: run.packageName,
      detail: 'full',
    });
    const info = json('GetAbapGitBranchInfo', answer);
    assert.ok(list(member(info, 'branches')).length > 0);
  });

  it('2. links the package on the run’s branch; R1 lists the key with the package, URL and branch', async (t) => {
    if (run.skipped(t)) return;
    run.journalLink();
    const linked = await liveCall('HandlerAbapGit', {
      action: 'link',
      package_name: run.packageName,
      url: run.url,
      branch: run.branch,
    });
    json('LinkAbapGitRepo', linked);
    const listed = await liveCall('HandlerAbapGitGet', {
      action: 'repos',
      package_name: run.packageName,
      detail: 'full',
    });
    run.confirmLink(listed);
  });

  it('3. pushes the two run-owned interfaces the staging shows; the remote branch holds their files', async (t) => {
    if (run.skipped(t)) return;
    await run.createInterfaces();
    const staged = await liveCall('HandlerAbapGitGet', {
      action: 'staging',
      repository_key: run.key(),
      detail: 'full',
    });
    const staging = json('GetAbapGitStaging', staged);
    const objects = run.interfaceNames.flatMap((name) =>
      pushedObjectsOf(staging, name),
    );
    assert.equal(objects.length, 2);
    const job = await run.openJob('PushAbapGitRepo');
    const pushed = await liveCall('HandlerAbapGit', {
      action: 'push',
      repository_key: run.key(),
      objects,
      comment: `abapGit live run ${run.runId}`,
      author: PERSON,
      committer: PERSON,
    });
    await run.endJob('PushAbapGitRepo', job, pushed);
    await run.assertPushed();
    const remoteFile = await liveCall('HandlerAbapGitGet', {
      action: 'file',
      repository_key: run.key(),
      filename: run.fileName,
      version: 'remote',
    });
    assert.equal(remoteFile.isError, false, remoteFile.text);
    assert.ok(
      remoteFile.text.toLowerCase().includes(run.interfaceName.toLowerCase()),
    );
  });

  it('3b. on the cloud: reads the push’s run log by its new log key', async (t) => {
    if (run.skippedUnless(t, 'cloud')) return;
    const answer = await liveCall('HandlerAbapGitGet', {
      action: 'error_log',
      repository_key: run.key(),
      app_log_key: run.lastLogKey(),
      detail: 'full',
    });
    const log = json('GetAbapGitErrorLog', answer);
    assert.ok(Array.isArray(member(log, 'objects')));
  });

  it('4. a change is made in the remote', async (t) => {
    if (run.skipped(t)) return;
    marker = await run.changeRemote();
  });

  it('4b. on the cloud: reads what a pull would change; the run interface is listed as update (changed only in the remote)', async (t) => {
    if (run.skippedUnless(t, 'cloud')) return;
    const answer = await liveCall('HandlerAbapGitGet', {
      action: 'modified_objects',
      repository_key: run.key(),
      detail: 'full',
    });
    run.assertRemoteOnly(json('GetAbapGitModifiedObjects', answer));
  });

  it('4c. pulls the remote change; the interface’s source changed in SAP', async (t) => {
    if (run.skipped(t)) return;
    const job = await run.openJob('PullAbapGitRepo');
    const pulled = await liveCall('HandlerAbapGit', {
      action: 'pull',
      repository_key: run.key(),
    });
    await run.endJob('PullAbapGitRepo', job, pulled);
    await run.assertPulled(marker);
  });

  it('4d. on the cloud: of two local changes the one selected in overwrite is overwritten, the other kept', async (t) => {
    if (run.skippedUnless(t, 'cloud')) return;
    await run.changeLocally();
    await run.changeLocally(run.secondInterface);
    const changed = await run.changeRemote('v2', 'v3');
    await run.changeRemote('v1', 'v2', run.secondInterface);
    const modified = await liveCall('HandlerAbapGitGet', {
      action: 'modified_objects',
      repository_key: run.key(),
      detail: 'full',
    });
    const overwrite = run.overwriteChangedLocally(
      json('GetAbapGitModifiedObjects', modified),
    );
    const job = await run.openJob('PullAbapGitRepo');
    const pulled = await liveCall('HandlerAbapGit', {
      action: 'pull',
      repository_key: run.key(),
      overwrite,
    });
    await run.endJob('PullAbapGitRepo', job, pulled);
    await run.assertPulled(changed, 'l1');
    await run.assertKeptLocal(run.secondInterface);
  });

  it('5. on premise: switches to the second branch and back; R1’s branch follows', async (t) => {
    if (run.skippedUnless(t, 'onprem')) return;
    const away = await liveCall('HandlerAbapGit', {
      action: 'switch_branch',
      repository_key: run.key(),
      branch: run.second,
      create: false,
    });
    json('SwitchAbapGitBranch', away);
    await run.followBranch(run.second);
    const back = await liveCall('HandlerAbapGit', {
      action: 'switch_branch',
      repository_key: run.key(),
      branch: run.branch,
      create: false,
    });
    json('SwitchAbapGitBranch', back);
    await run.followBranch(run.branch);
  });

  it('6. runs the checks and reads the file local; the checks as SAP answers them on each system', async (t) => {
    if (run.skipped(t)) return;
    const checks = await liveCall('HandlerAbapGitGet', {
      action: 'checks',
      repository_key: run.key(),
    });
    // On the onprem system abapgit.check_repo_fault_system names, SAP's
    // handler ends in SYNTAX_ERROR (measured): its refusal, asserted whole.
    // On any other system, onprem or cloud, the checks answer.
    if (checksFaultHere(run.backend)) assertOnpremChecksFault(checks);
    else assert.equal(checks.isError, false, checks.text);
    const local = await liveCall('HandlerAbapGitGet', {
      action: 'file',
      repository_key: run.key(),
      filename: run.fileName,
      version: 'local',
    });
    assert.equal(local.isError, false, local.text);
  });

  describe('6b. with no approved endpoint: the remote file read goes without a credential', () => {
    throughServer(() => Promise.resolve(run.anonymousRestriction()));
    it('the private remote refuses it: 500 with SAP’s T100 key 00/001', async (t) => {
      if (run.skipped(t)) return;
      const remote = await liveCall('HandlerAbapGitGet', {
        action: 'file',
        repository_key: run.key(),
        filename: run.fileName,
        version: 'remote',
      });
      assertAnonymousFileT100(remote);
    });
  });

  describe('7. under an allowed-packages entry naming the run’s package', () => {
    throughServer(async () => run.ownPackageRestriction());
    it('link and pull are refused with nothing sent', async (t) => {
      if (run.skipped(t)) return;
      const link = await liveCall('HandlerAbapGit', {
        action: 'link',
        package_name: run.packageName,
        url: run.url,
        branch: run.branch,
      });
      assert.equal(link.isError, true);
      assert.match(link.text, /abapgit_import_not_allowed/);
      const pull = await liveCall('HandlerAbapGit', {
        action: 'pull',
        repository_key: run.key(),
      });
      assert.equal(pull.isError, true);
      assert.match(pull.text, /abapgit_import_not_allowed/);
    });

    it('on premise: the switch is checked against the repository’s package and runs', async (t) => {
      if (run.skippedUnless(t, 'onprem')) return;
      const switched = await liveCall('HandlerAbapGit', {
        action: 'switch_branch',
        repository_key: run.key(),
        branch: run.branch,
        create: false,
      });
      json('SwitchAbapGitBranch', switched);
    });
  });

  describe('7. under an allowed-packages entry naming another package', () => {
    throughServer(async () => run.otherPackageRestriction());
    it('push and unlink are refused by the repository’s package', async (t) => {
      if (run.skipped(t)) return;
      const push = await liveCall('HandlerAbapGit', {
        action: 'push',
        repository_key: run.key(),
        objects: [],
        comment: 'refused',
        author: PERSON,
        committer: PERSON,
      });
      assert.equal(push.isError, true);
      assert.match(push.text, /package_not_allowed/);
      const unlink = await liveCall('HandlerAbapGit', {
        action: 'unlink',
        repository_key: run.key(),
      });
      assert.equal(unlink.isError, true);
      assert.match(unlink.text, /package_not_allowed/);
    });
  });

  it('8. unlinks the run’s repository, checked against the ledger first; R1 no longer lists it', async (t) => {
    if (run.skipped(t)) return;
    await run.assertOwnRepo();
    const unlinked = await liveCall('HandlerAbapGit', {
      action: 'unlink',
      repository_key: run.key(),
    });
    await run.unlinked(unlinked);
  });
});
