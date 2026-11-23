/**
 * The abapGit tools are always listed (plan T6.9, owner 2026-11-23): a
 * server on the live system lists them per system kind — the full set and
 * compact `HandlerAbapGitGet` / `HandlerAbapGit`, and the read set in `-ro` —
 * and the listing sends nothing to SAP. Whether the system serves abapGit is
 * decided at call time only (`abapGit.live.test.ts`).
 *
 * On premise and on the cloud; a server of its own per set, on the suite's
 * connection.
 */

import assert from 'node:assert/strict';
import { it, mock } from 'node:test';
import { compactToolSet } from '../../../../compact/src/launcher';
import { isAbapGitTool } from '../../../lib/abapGit/tools';
import { fullReadOnlyToolSet, fullToolSet } from '../../../lib/toolSet';
import { inProcessServer } from '../../helpers/pinServer';
import type { SystemKind } from '../../helpers/servedTools';
import { configuredSystemKind } from '../helpers/configHelpers';
import { liveConnection, liveSuite } from '../helpers/live';

/** The abapGit tools each kind lists, full and compact. */
const LISTED: Readonly<Record<SystemKind, readonly string[]>> = {
  onprem: [
    'ListAbapGitRepos',
    'CheckAbapGitExternalRepo',
    'LinkAbapGitRepo',
    'UnlinkAbapGitRepo',
    'PullAbapGitRepo',
    'GetAbapGitStaging',
    'PushAbapGitRepo',
    'CheckAbapGitRepo',
    'GetAbapGitFile',
    'SwitchAbapGitBranch',
    'HandlerAbapGitGet',
    'HandlerAbapGit',
  ],
  cloud: [
    'ListAbapGitRepos',
    'CheckAbapGitExternalRepo',
    'GetAbapGitBranchInfo',
    'LinkAbapGitRepo',
    'UnlinkAbapGitRepo',
    'PullAbapGitRepo',
    'GetAbapGitModifiedObjects',
    'GetAbapGitStaging',
    'PushAbapGitRepo',
    'CheckAbapGitRepo',
    'GetAbapGitFile',
    'GetAbapGitErrorLog',
    'HandlerAbapGitGet',
    'HandlerAbapGit',
  ],
};

/** The read set `-ro` lists. */
const LISTED_RO: Readonly<Record<SystemKind, readonly string[]>> = {
  onprem: [
    'ListAbapGitRepos',
    'CheckAbapGitExternalRepo',
    'GetAbapGitStaging',
    'CheckAbapGitRepo',
    'GetAbapGitFile',
  ],
  cloud: [
    'ListAbapGitRepos',
    'CheckAbapGitExternalRepo',
    'GetAbapGitModifiedObjects',
    'GetAbapGitStaging',
    'CheckAbapGitRepo',
    'GetAbapGitFile',
    'GetAbapGitErrorLog',
  ],
};

const sorted = (names: readonly string[]): string[] =>
  [...names].sort((a, b) => a.localeCompare(b));

/** The abapGit tools a server of `sets` lists, and the requests the listing sent. */
async function listing(
  kind: SystemKind,
  sets: Parameters<typeof inProcessServer>[3],
): Promise<{ names: string[]; sent: number }> {
  const connection = liveConnection();
  const server = await inProcessServer(
    kind,
    { injected: connection },
    undefined,
    sets,
  );
  const spy = mock.method(connection, 'makeAdtRequest');
  try {
    const names = (await server.listed()).filter(isAbapGitTool);
    return { names: sorted(names), sent: spy.mock.callCount() };
  } finally {
    spy.mock.restore();
    await server.close();
  }
}

liveSuite(['onprem', 'cloud'], 'abapGit tools listed', () => {
  const kind: SystemKind =
    configuredSystemKind() === 'cloud' ? 'cloud' : 'onprem';

  it('the full and compact sets list the abapGit tools of the system kind, sending nothing', async () => {
    const listed = await listing(kind, {
      toolSets: [fullToolSet, compactToolSet],
    });
    assert.deepEqual(listed.names, sorted(LISTED[kind]));
    assert.equal(listed.sent, 0);
  });

  it('-ro lists the read set, sending nothing', async () => {
    const listed = await listing(kind, { toolSets: [fullReadOnlyToolSet] });
    assert.deepEqual(listed.names, sorted(LISTED_RO[kind]));
    assert.equal(listed.sent, 0);
  });
});
