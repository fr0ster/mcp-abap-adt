/**
 * The full abapGit tools (spec §4.1, T6.5): their schemas per variant, the
 * read-only set, deny entries, each handler's request through a new form of
 * `AdtAbapGitClient` (never a legacy form), R1's branch passed to pull, the
 * answers as facts only (minified, nothing cut), SAP's structured error, and
 * the refusal of a call that reached its tool without the server's
 * admission.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { handleGetAbapGitBranchInfo } from '../../../handlers/abapgit/high/handleGetAbapGitBranchInfo';
import { handleLinkAbapGitRepo } from '../../../handlers/abapgit/high/handleLinkAbapGitRepo';
import { handlePullAbapGitRepo } from '../../../handlers/abapgit/high/handlePullAbapGitRepo';
import { handlePushAbapGitRepo } from '../../../handlers/abapgit/high/handlePushAbapGitRepo';
import { handleSwitchAbapGitBranch } from '../../../handlers/abapgit/high/handleSwitchAbapGitBranch';
import { handleUnlinkAbapGitRepo } from '../../../handlers/abapgit/high/handleUnlinkAbapGitRepo';
import { handleCheckAbapGitExternalRepo } from '../../../handlers/abapgit/readonly/handleCheckAbapGitExternalRepo';
import { handleCheckAbapGitRepo } from '../../../handlers/abapgit/readonly/handleCheckAbapGitRepo';
import { handleGetAbapGitErrorLog } from '../../../handlers/abapgit/readonly/handleGetAbapGitErrorLog';
import { handleGetAbapGitFile } from '../../../handlers/abapgit/readonly/handleGetAbapGitFile';
import { handleGetAbapGitModifiedObjects } from '../../../handlers/abapgit/readonly/handleGetAbapGitModifiedObjects';
import { handleGetAbapGitStaging } from '../../../handlers/abapgit/readonly/handleGetAbapGitStaging';
import { handleListAbapGitRepos } from '../../../handlers/abapgit/readonly/handleListAbapGitRepos';
import type { AbapGitAdmission } from '../../../lib/abapGit/admission';
import * as clientModule from '../../../lib/abapGit/client';
import { ABAPGIT_FULL_TOOLS } from '../../../lib/abapGit/tools';
import { parseDeniedEntry } from '../../../lib/access/deniedActions';
import { ABAPGIT_NOT_ADMITTED_WORDS } from '../../../lib/auth/serverRefusal';
import type {
  HandlerEntry,
  ToolDefinition,
} from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import {
  fullReadOnlyToolSet,
  fullToolSet,
  restrictedStart,
} from '../../../lib/toolSet';
import {
  ADMITTED_REPO,
  ALL_CANARIES,
  answerText,
  BOUND_CREDENTIALS,
  contextOn,
  exception,
  externalRepo,
  modifiedObjects,
  noObjects,
  objectResults,
  pathOf,
  REPO_BRANCH,
  REPO_KEY,
  REPO_URL,
  reposDocument,
  type SentRequest,
  staging,
  stubSap,
} from '../../helpers/abapGitSap';

const SERVED = { dataTools: false };

function entriesOf(
  set: typeof fullToolSet,
  transport: 'stdio' | 'http' | 'sse' = 'stdio',
): HandlerEntry[] {
  return set
    .groups(noConnectionContext(), transport, SERVED)
    .flatMap((group) => group.getHandlers());
}

const ABAPGIT: ReadonlySet<string> = new Set(ABAPGIT_FULL_TOOLS);

const READS = [
  'ListAbapGitRepos',
  'CheckAbapGitExternalRepo',
  'GetAbapGitModifiedObjects',
  'GetAbapGitStaging',
  'CheckAbapGitRepo',
  'GetAbapGitFile',
  'GetAbapGitErrorLog',
];

/** Whether `definition` is registered on `kind` (`available_in`). */
function onKind(definition: ToolDefinition, kind: 'onprem' | 'cloud') {
  return (
    definition.available_in === undefined ||
    definition.available_in.includes(kind)
  );
}

function abapGitDefinitions(): ToolDefinition[] {
  return entriesOf(fullToolSet)
    .map((entry) => entry.toolDefinition)
    .filter((definition) => ABAPGIT.has(definition.name));
}

function definitionOf(name: string): ToolDefinition {
  const found = abapGitDefinitions().find((each) => each.name === name);
  assert.ok(found, `${name} is registered`);
  return found;
}

function schemaKeys(definition: ToolDefinition, kind: 'onprem' | 'cloud') {
  const schema =
    definition.variants?.[kind].inputSchema ?? definition.inputSchema;
  return Object.keys(schema.shape).sort();
}

describe('the abapGit tools: registration', () => {
  it('the full set registers every abapGit tool, once', () => {
    const names = abapGitDefinitions().map((definition) => definition.name);
    assert.deepEqual([...names].sort(), [...ABAPGIT_FULL_TOOLS].sort());
  });

  it('the read-only set registers the reads alone', () => {
    const names = entriesOf(fullReadOnlyToolSet)
      .map((entry) => entry.toolDefinition.name)
      .filter((name) => ABAPGIT.has(name));
    assert.deepEqual([...names].sort(), [...READS].sort());
  });

  it('each kind registers what its system serves', () => {
    const on = (kind: 'onprem' | 'cloud') =>
      abapGitDefinitions()
        .filter((definition) => onKind(definition, kind))
        .map((definition) => definition.name)
        .sort();
    assert.deepEqual(
      on('cloud'),
      ABAPGIT_FULL_TOOLS.filter((name) => name !== 'SwitchAbapGitBranch')
        .slice()
        .sort(),
    );
    assert.deepEqual(
      on('onprem'),
      ABAPGIT_FULL_TOOLS.filter(
        (name) =>
          name !== 'GetAbapGitBranchInfo' &&
          name !== 'GetAbapGitModifiedObjects' &&
          name !== 'GetAbapGitErrorLog',
      )
        .slice()
        .sort(),
    );
  });

  it('the schemas take the arguments of spec §4.1 and no credential', () => {
    const expected: Record<string, readonly string[]> = {
      ListAbapGitRepos: ['detail', 'package_name', 'repository_key'],
      CheckAbapGitExternalRepo: ['detail', 'url'],
      GetAbapGitBranchInfo: ['branch', 'detail', 'package_name', 'url'],
      UnlinkAbapGitRepo: ['repository_key'],
      PullAbapGitRepo: ['background', 'repository_key', 'transport_request'],
      GetAbapGitModifiedObjects: ['detail', 'repository_key'],
      GetAbapGitStaging: ['detail', 'repository_key'],
      PushAbapGitRepo: [
        'author',
        'background',
        'comment',
        'committer',
        'objects',
        'repository_key',
      ],
      CheckAbapGitRepo: ['repository_key'],
      GetAbapGitFile: ['filename', 'repository_key', 'version'],
      SwitchAbapGitBranch: ['branch', 'create', 'repository_key'],
      GetAbapGitErrorLog: ['app_log_key', 'detail', 'repository_key'],
    };
    for (const [name, keys] of Object.entries(expected)) {
      assert.deepEqual(schemaKeys(definitionOf(name), 'onprem'), keys, name);
    }
    const link = definitionOf('LinkAbapGitRepo');
    assert.deepEqual(schemaKeys(definitionOf('PullAbapGitRepo'), 'cloud'), [
      'overwrite',
      'repository_key',
      'transport_request',
    ]);
    assert.deepEqual(schemaKeys(link, 'onprem'), [
      'background',
      'branch',
      'package_name',
      'transport_request',
      'url',
    ]);
    assert.deepEqual(schemaKeys(link, 'cloud'), [
      'branch',
      'folder_logic',
      'package_name',
      'transport_request',
      'url',
    ]);
  });

  it('detail offers terse, medium and full — no raw', () => {
    const schema = definitionOf('ListAbapGitRepos').inputSchema;
    assert.equal(schema.safeParse({ detail: 'medium' }).success, true);
    assert.equal(schema.safeParse({ detail: 'raw' }).success, false);
  });

  it("the cloud pull's overwrite takes objects of non-empty type and name, at least one", () => {
    const schema = definitionOf('PullAbapGitRepo').variants?.cloud.inputSchema;
    assert.ok(schema !== undefined);
    const parses = (overwrite: unknown) =>
      schema.safeParse({ repository_key: REPO_KEY, overwrite }).success;
    assert.equal(parses([{ type: 'CLAS/OC', name: 'ZCL_DEMO' }]), true);
    assert.equal(parses([]), false);
    assert.equal(parses([{ type: '', name: 'ZCL_DEMO' }]), false);
    assert.equal(parses([{ type: 'CLAS/OC', name: '' }]), false);
  });

  it('a deny entry removes the tool it names', () => {
    const start = restrictedStart(fullToolSet, 'stdio', SERVED, {
      deniedActions: [parseDeniedEntry('PullAbapGitRepo', '--deny-actions')],
      lists: {},
    });
    const names = start.registry
      .getHandlerGroups()
      .flatMap((group) => group.getHandlers())
      .map((entry) => entry.toolDefinition.name);
    assert.equal(names.includes('PullAbapGitRepo'), false);
    assert.equal(names.includes('PushAbapGitRepo'), true);
  });
});

const R1: AbapGitAdmission = {
  repo: ADMITTED_REPO,
  credentials: BOUND_CREDENTIALS,
};

/** The one request a handler sent, and its answer. */
async function run(
  handler: (context: ReturnType<typeof contextOn>) => Promise<{
    content: ReadonlyArray<{ text?: string }>;
    isError?: boolean;
  }>,
  admission: AbapGitAdmission | undefined,
  route: Parameters<typeof stubSap>[0] = () => undefined,
) {
  const sap = stubSap(route);
  const result = await handler(contextOn(sap.connection, admission));
  return { sent: sap.sent, text: answerText(result), result };
}

function only(sent: readonly SentRequest[]): SentRequest {
  assert.equal(sent.length, 1, 'exactly one request');
  const [request] = sent;
  assert.ok(request);
  return request;
}

const header = (request: SentRequest, name: string) =>
  Object.entries(request.headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )?.[1];

describe('the abapGit tools: requests', () => {
  it('ListAbapGitRepos reads R1 once, stateless, unlogged, and filters it', async () => {
    const { sent, text } = await run(
      (context) =>
        handleListAbapGitRepos(context, { package_name: 'ZPKG_GIT' }),
      {},
      () => ({ status: 200, data: reposDocument }),
    );
    const request = only(sent);
    assert.equal(request.method, 'GET');
    assert.equal(pathOf(request.url), '/sap/bc/adt/abapgit/repos');
    assert.equal(request.stateless, true);
    assert.equal(request.noLog, true);
    assert.deepEqual(text.split('\n'), [
      'key\tpackage\tbranch_name\turl\trun_status',
      `${REPO_KEY}\tZPKG_GIT\t${REPO_BRANCH}\t${REPO_URL}\tS`,
    ]);
  });

  it('ListAbapGitRepos answers every field at medium, the facts as minified JSON at full', async () => {
    const medium = await run(
      (context) =>
        handleListAbapGitRepos(context, {
          repository_key: REPO_KEY,
          detail: 'medium',
        }),
      {},
      () => ({ status: 200, data: reposDocument }),
    );
    assert.deepEqual(medium.text.split('\n'), [
      'key\tpackage\tbranch_name\turl\trun_status\tstatus_text\tapp_log_key',
      `${REPO_KEY}\tZPKG_GIT\t${REPO_BRANCH}\t${REPO_URL}\tS\tPull finished\t0123456789ABCDEF0123456789ABCDEF`,
    ]);
    const full = await run(
      (context) => handleListAbapGitRepos(context, { detail: 'full' }),
      {},
      () => ({ status: 200, data: reposDocument }),
    );
    const parsed = JSON.parse(full.text);
    assert.equal(parsed.repos.length, 2);
    assert.equal(full.text, JSON.stringify(parsed));
  });

  it('CheckAbapGitExternalRepo sends the bound URL with its credential', async () => {
    const { sent, text } = await run(
      (context) =>
        handleCheckAbapGitExternalRepo(context, {
          url: 'https://alias.invalid/r',
        }),
      { sendUrl: REPO_URL, credentials: BOUND_CREDENTIALS },
      () => ({ status: 200, data: externalRepo() }),
    );
    const request = only(sent);
    assert.equal(request.method, 'POST');
    assert.equal(pathOf(request.url), '/sap/bc/adt/abapgit/externalrepoinfo');
    assert.equal(String(request.data).includes(REPO_URL), true);
    assert.equal(String(request.data).includes('alias.invalid'), false);
    assert.deepEqual(text.split('\n'), [
      '# access_mode PRIVATE',
      'name\tis_head',
      'refs/heads/main\tX',
    ]);
  });

  it('GetAbapGitBranchInfo sends the bound URL, the branch and the package', async () => {
    const { sent } = await run(
      (context) =>
        handleGetAbapGitBranchInfo(context, {
          url: REPO_URL,
          branch: 'refs/heads/main',
          package_name: 'ZPKG_GIT',
        }),
      { sendUrl: REPO_URL, credentials: null },
      () => ({ status: 200, data: externalRepo({ folderLogic: true }) }),
    );
    const request = only(sent);
    assert.equal(
      pathOf(request.url),
      '/sap/bc/adt/abapgit/externalrepoinfo/branchinfo',
    );
    assert.equal(String(request.data).includes('ZPKG_GIT'), true);
  });

  it('LinkAbapGitRepo sends the bound URL on the branch asked', async () => {
    const { sent, text } = await run(
      (context) =>
        handleLinkAbapGitRepo(context, {
          package_name: 'ZPKG_GIT',
          url: 'https://alias.invalid/r',
          branch: 'refs/heads/main',
        }),
      { sendUrl: REPO_URL, credentials: null },
      () => ({ status: 200, data: noObjects }),
    );
    const request = only(sent);
    assert.equal(request.method, 'POST');
    assert.equal(pathOf(request.url), '/sap/bc/adt/abapgit/repos');
    assert.equal(String(request.data).includes(REPO_URL), true);
    assert.equal(String(request.data).includes('refs/heads/main'), true);
    assert.equal(text, '{"status":200,"result":"done"}');
  });

  it("PullAbapGitRepo sends the R1 entry's branch, no selection (repo.v3)", async () => {
    const { sent, text } = await run(
      (context) => handlePullAbapGitRepo(context, { repository_key: REPO_KEY }),
      R1,
      () => ({ status: 200, data: noObjects }),
    );
    const request = only(sent);
    assert.equal(request.method, 'POST');
    assert.equal(
      pathOf(request.url),
      `/sap/bc/adt/abapgit/repos/${REPO_KEY}/pull`,
    );
    assert.equal(
      header(request, 'Content-Type'),
      'application/abapgit.adt.repo.v3+xml',
    );
    const body = String(request.data);
    assert.equal(body.includes(`>${REPO_BRANCH}<`), true, body);
    assert.equal(body.includes('pull.req'), false);
    assert.equal(request.stateless, true);
    assert.equal(request.noResend, true);
    assert.equal(text, '{"status":200,"result":"done"}');
  });

  it('PullAbapGitRepo with overwrite reads R6, then sends exactly the selected entries as R6 answered them (pull.req.v1)', async () => {
    const { sent, text } = await run(
      (context) =>
        handlePullAbapGitRepo(context, {
          repository_key: REPO_KEY,
          overwrite: [{ type: 'CLAS/OC', name: 'ZCL_DEMO' }],
        }),
      R1,
      (request) =>
        request.method === 'GET'
          ? { status: 200, data: modifiedObjects }
          : { status: 202, data: '' },
    );
    assert.equal(sent.length, 2);
    const [read, pull] = sent;
    assert.ok(read !== undefined && pull !== undefined);
    assert.equal(
      pathOf(read.url),
      `/sap/bc/adt/abapgit/repos/${REPO_KEY}/pull/modifiedobjects`,
    );
    assert.equal(pull.method, 'POST');
    assert.equal(
      pathOf(pull.url),
      `/sap/bc/adt/abapgit/repos/${REPO_KEY}/pull`,
    );
    assert.equal(
      header(pull, 'Content-Type'),
      'application/abapgit.adt.repo.pull.req.v1+xml',
    );
    assert.equal(header(pull, 'Accept'), 'application/abapgit.adt.repo.v3+xml');
    const body = String(pull.data);
    assert.equal(
      body.includes(
        `<abapgitpullrequest:branchName>${REPO_BRANCH}</abapgitpullrequest:branchName>`,
      ),
      true,
      body,
    );
    assert.equal(
      body.includes(
        '<agitpullmodifiedobjects:overwriteObjects><agitpullmodifiedobjects:abapgitobjects adtcore:uri="/sap/bc/adt/oo/classes/zcl_demo" adtcore:type="CLAS/OC" adtcore:name="ZCL_DEMO" adtcore:packageName="ZPKG" agitpullmodifiedobjects:action="2"/></agitpullmodifiedobjects:overwriteObjects>',
      ),
      true,
      body,
    );
    assert.equal(body.includes('ZDEMO'), false, body);
    assert.equal(pull.stateless, true);
    assert.equal(pull.noResend, true);
    assert.equal(text, '{"status":202,"result":"accepted"}');
  });

  it('an overwrite entry R6 does not list is refused after R6, nothing pulled', async () => {
    const { sent, text } = await run(
      (context) =>
        handlePullAbapGitRepo(context, {
          repository_key: REPO_KEY,
          overwrite: [{ type: 'CLAS/OC', name: 'ZCL_OTHER' }],
        }),
      R1,
      () => ({ status: 200, data: modifiedObjects }),
    );
    assert.equal(only(sent).method, 'GET');
    assert.equal(JSON.parse(text).error, 'abapgit_overwrite_not_listed');
    // The name R6 lists, under another type: matched by both.
    const otherType = await run(
      (context) =>
        handlePullAbapGitRepo(context, {
          repository_key: REPO_KEY,
          overwrite: [{ type: 'PROG/P', name: 'ZCL_DEMO' }],
        }),
      R1,
      () => ({ status: 200, data: modifiedObjects }),
    );
    assert.equal(only(otherType.sent).method, 'GET');
    assert.equal(
      JSON.parse(otherType.text).error,
      'abapgit_overwrite_not_listed',
    );
  });

  it('a selected package-warning entry is sent in packageWarningObjects as R6 answered it, the overwrite list empty', async () => {
    const { sent } = await run(
      (context) =>
        handlePullAbapGitRepo(context, {
          repository_key: REPO_KEY,
          overwrite: [{ type: 'PROG/P', name: 'ZDEMO' }],
        }),
      R1,
      (request) =>
        request.method === 'GET'
          ? { status: 200, data: modifiedObjects }
          : { status: 202, data: '' },
    );
    const body = String(sent[1]?.data);
    assert.equal(
      body.includes(
        '<agitpullmodifiedobjects:packageWarningObjects><agitpullmodifiedobjects:abapgitobjects adtcore:uri="/sap/bc/adt/programs/programs/zdemo" adtcore:type="PROG/P" adtcore:name="ZDEMO" adtcore:packageName="ZOTHER" agitpullmodifiedobjects:action="3"/></agitpullmodifiedobjects:packageWarningObjects>',
      ),
      true,
      body,
    );
    assert.equal(body.includes('ZCL_DEMO'), false, body);
  });

  it('a selected name R6 lists under another type too is refused after R6, nothing pulled: SAP matches by name alone', async () => {
    const shared = modifiedObjects.replace(
      'adtcore:name="ZDEMO"',
      'adtcore:name="ZCL_DEMO"',
    );
    const { sent, text } = await run(
      (context) =>
        handlePullAbapGitRepo(context, {
          repository_key: REPO_KEY,
          overwrite: [{ type: 'CLAS/OC', name: 'ZCL_DEMO' }],
        }),
      R1,
      () => ({ status: 200, data: shared }),
    );
    assert.equal(only(sent).method, 'GET');
    assert.equal(JSON.parse(text).error, 'abapgit_overwrite_ambiguous');
  });

  it('a cloud pull answers accepted after its one request; on premise done with the objects', async () => {
    const accepted = await run(
      (context) => handlePullAbapGitRepo(context, { repository_key: REPO_KEY }),
      R1,
      () => ({ status: 202, data: '' }),
    );
    only(accepted.sent);
    assert.equal(accepted.text, '{"status":202,"result":"accepted"}');
    const done = await run(
      (context) => handlePullAbapGitRepo(context, { repository_key: REPO_KEY }),
      R1,
      () => ({ status: 200, data: objectResults }),
    );
    assert.deepEqual(JSON.parse(done.text), {
      status: 200,
      result: 'done',
      objects: [
        {
          type: 'CLAS',
          name: 'ZCL_DEMO',
          package: 'ZPKG',
          status: 'E',
          messageType: 'E',
        },
      ],
    });
  });

  it('PushAbapGitRepo sends the chosen objects and the commit; cloud answers accepted', async () => {
    const { sent, text } = await run(
      (context) =>
        handlePushAbapGitRepo(context, {
          repository_key: REPO_KEY,
          objects: [
            {
              wbkey: 'CLASZCL_DEMO',
              version: 'active',
              uri: '/sap/bc/adt/oo/classes/zcl_demo',
              type: 'CLAS/OC',
              name: 'ZCL_DEMO',
              package_name: 'ZPKG',
              files: [
                {
                  name: 'zcl_demo.clas.abap',
                  path: '/src/',
                  local_state: 'M',
                  remote_state: '',
                },
              ],
            },
          ],
          comment: 'the commit message',
          author: { name: 'Ada Author', email: 'ada@example.invalid' },
          committer: { name: 'Carl Committer', email: 'carl@example.invalid' },
        }),
      R1,
      () => ({ status: 202, data: '' }),
    );
    const request = only(sent);
    assert.equal(
      pathOf(request.url),
      `/sap/bc/adt/abapgit/repos/${REPO_KEY}/push`,
    );
    const body = String(request.data);
    assert.equal(body.includes('zcl_demo.clas.abap'), true);
    assert.equal(body.includes('the commit message'), true);
    assert.equal(text, '{"status":202,"result":"accepted"}');
  });

  it('the key routes address the R1 entry by its key', async () => {
    const cases = [
      {
        call: (context: ReturnType<typeof contextOn>) =>
          handleGetAbapGitStaging(context, { repository_key: REPO_KEY }),
        method: 'GET',
        path: `/sap/bc/adt/abapgit/repos/${REPO_KEY}/stage`,
        data: staging,
      },
      {
        call: (context: ReturnType<typeof contextOn>) =>
          handleGetAbapGitModifiedObjects(context, {
            repository_key: REPO_KEY,
          }),
        method: 'GET',
        path: `/sap/bc/adt/abapgit/repos/${REPO_KEY}/pull/modifiedobjects`,
        data: modifiedObjects,
      },
      {
        call: (context: ReturnType<typeof contextOn>) =>
          handleCheckAbapGitRepo(context, { repository_key: REPO_KEY }),
        method: 'POST',
        path: `/sap/bc/adt/abapgit/repos/${REPO_KEY}/checks`,
        data: '',
      },
      {
        call: (context: ReturnType<typeof contextOn>) =>
          handleGetAbapGitFile(context, {
            repository_key: REPO_KEY,
            filename: 'zcl_demo.clas.abap',
            version: 'remote',
          }),
        method: 'GET',
        path: `/sap/bc/adt/abapgit/repos/${REPO_KEY}/files`,
        data: 'CLASS zcl_demo DEFINITION.',
      },
      {
        call: (context: ReturnType<typeof contextOn>) =>
          handleSwitchAbapGitBranch(context, {
            repository_key: REPO_KEY,
            branch: 'refs/heads/other',
            create: false,
          }),
        method: 'POST',
        path: `/sap/bc/adt/abapgit/repos/${REPO_KEY}/branches/refs%2Fheads%2Fother`,
        data: '',
      },
      {
        call: (context: ReturnType<typeof contextOn>) =>
          handleGetAbapGitErrorLog(context, {
            repository_key: REPO_KEY,
            app_log_key: '0123456789ABCDEF0123456789ABCDEF',
          }),
        method: 'GET',
        path: `/sap/bc/adt/abapgit/repos/${REPO_KEY}/log/0123456789ABCDEF0123456789ABCDEF`,
        data: objectResults,
      },
    ];
    for (const each of cases) {
      const { sent, result } = await run(each.call, R1, () => ({
        status: 200,
        data: each.data,
      }));
      const request = only(sent);
      assert.equal(request.method, each.method, each.path);
      assert.equal(pathOf(request.url), each.path);
      assert.equal(request.stateless, true, each.path);
      assert.notEqual(result.isError, true, each.path);
    }
  });

  it('GetAbapGitFile answers the file text as it is', async () => {
    const { text } = await run(
      (context) =>
        handleGetAbapGitFile(context, {
          repository_key: REPO_KEY,
          filename: 'zcl_demo.clas.abap',
          version: 'local',
        }),
      R1,
      () => ({ status: 200, data: 'CLASS zcl_demo DEFINITION.\n' }),
    );
    assert.equal(text, 'CLASS zcl_demo DEFINITION.\n');
  });

  it('UnlinkAbapGitRepo deletes the R1 entry by its key, through the existing member', async () => {
    const { sent, text } = await run(
      (context) =>
        handleUnlinkAbapGitRepo(context, { repository_key: REPO_KEY }),
      R1,
    );
    const request = only(sent);
    assert.equal(request.method, 'DELETE');
    assert.equal(pathOf(request.url), `/sap/bc/adt/abapgit/repos/${REPO_KEY}`);
    assert.equal(text, '{"result":"done"}');
  });
});

describe('the abapGit tools: failures', () => {
  it("SAP's refusal is the structured error: its message and facts, minified, no SAP text", async () => {
    const { text, result } = await run(
      (context) =>
        handleCheckAbapGitRepo(context, { repository_key: REPO_KEY }),
      R1,
      () => ({ status: 500, data: exception({ httpStatus: '401' }) }),
    );
    assert.equal(result.isError, true);
    assert.deepEqual(JSON.parse(text), {
      message: 'The git host refused the request SAP sent to it.',
      facts: {
        status: 500,
        messageClass: 'ABAPGIT_MSG',
        messageNumber: '017',
        gitHttpStatus: 401,
      },
    });
    assert.equal(text, JSON.stringify(JSON.parse(text)));
    for (const canary of ALL_CANARIES) {
      assert.equal(text.includes(canary), false, canary);
    }
  });

  it('a call without the admission is refused in fixed words, nothing sent', async () => {
    const calls = [
      (context: ReturnType<typeof contextOn>) =>
        handleListAbapGitRepos(context, {}),
      (context: ReturnType<typeof contextOn>) =>
        handlePullAbapGitRepo(context, { repository_key: REPO_KEY }),
      (context: ReturnType<typeof contextOn>) =>
        handleLinkAbapGitRepo(context, {
          package_name: 'ZPKG',
          url: REPO_URL,
          branch: 'refs/heads/main',
        }),
      (context: ReturnType<typeof contextOn>) =>
        handleUnlinkAbapGitRepo(context, { repository_key: REPO_KEY }),
    ];
    for (const call of calls) {
      const { sent, text, result } = await run(call, undefined);
      assert.equal(sent.length, 0);
      assert.equal(result.isError, true);
      assert.equal(text.includes(ABAPGIT_NOT_ADMITTED_WORDS), true, text);
    }
  });
});

/** The members a handler called on a recording stand-in of the client, with their options. */
function recordingClient(calls: Array<{ member: string; options: unknown }>) {
  const ok = (value: unknown) => ({
    ok: true as const,
    getResult: () => ({ value }),
  });
  const facts = (f: unknown) => ok({ status: 200, facts: f });
  const record =
    (member: string, value: unknown) =>
    async (_args: unknown, options?: unknown) => {
      calls.push({ member, options });
      return value;
    };
  return {
    listReposQuiet: async (options?: unknown) => {
      calls.push({ member: 'listReposQuiet', options });
      return facts({ repos: [] });
    },
    checkExternalRepo: record(
      'checkExternalRepo',
      facts({ accessMode: 'PUBLIC', branches: [] }),
    ),
    getBranchInfo: record(
      'getBranchInfo',
      facts({ accessMode: 'PUBLIC', branches: [] }),
    ),
    link: record('link', facts({ objects: [] })),
    unlink: record('unlink', ok(undefined)),
    pullRepo: record('pullRepo', facts({ objects: [] })),
    getModifiedObjects: record(
      'getModifiedObjects',
      facts({ overwriteObjects: [], packageWarningObjects: [] }),
    ),
    getStaging: record(
      'getStaging',
      facts({
        unstaged: [],
        staged: [],
        ignored: [],
        author: { name: '', email: '' },
        committer: { name: '', email: '' },
      }),
    ),
    push: record('push', facts({})),
    checkRepo: record('checkRepo', facts({})),
    getFile: record(
      'getFile',
      facts({ filename: 'f', version: 'local', content: '' }),
    ),
    switchBranch: record('switchBranch', facts({})),
    getRunLog: record('getRunLog', facts({ objects: [] })),
  };
}

describe('the abapGit tools: client forms', () => {
  it('the server never selects a legacy form', async () => {
    const calls: Array<{ member: string; options: unknown }> = [];
    const stand = recordingClient(calls);
    mock.method(
      clientModule,
      'abapGitClientOf',
      // A stand-in with the members the handlers call; the rest is never reached.
      () => stand as unknown as clientModule.AbapGitClient,
    );
    try {
      const url: AbapGitAdmission = { sendUrl: REPO_URL, credentials: null };
      const context = (admission: AbapGitAdmission) =>
        contextOn(stubSap().connection, admission);
      await handleListAbapGitRepos(context({}), {});
      await handleCheckAbapGitExternalRepo(context(url), { url: REPO_URL });
      await handleGetAbapGitBranchInfo(context(url), {
        url: REPO_URL,
        branch: 'b',
        package_name: 'P',
      });
      await handleLinkAbapGitRepo(context(url), {
        package_name: 'P',
        url: REPO_URL,
        branch: 'b',
      });
      await handleUnlinkAbapGitRepo(context(R1), { repository_key: REPO_KEY });
      await handlePullAbapGitRepo(context(R1), { repository_key: REPO_KEY });
      await handleGetAbapGitModifiedObjects(context(R1), {
        repository_key: REPO_KEY,
      });
      await handleGetAbapGitStaging(context(R1), { repository_key: REPO_KEY });
      await handlePushAbapGitRepo(context(R1), {
        repository_key: REPO_KEY,
        objects: [],
        comment: 'c',
        author: { name: 'a', email: 'a@example.invalid' },
        committer: { name: 'c', email: 'c@example.invalid' },
      });
      await handleCheckAbapGitRepo(context(R1), { repository_key: REPO_KEY });
      await handleGetAbapGitFile(context(R1), {
        repository_key: REPO_KEY,
        filename: 'f',
        version: 'local',
      });
      await handleSwitchAbapGitBranch(context(R1), {
        repository_key: REPO_KEY,
        branch: 'b',
        create: false,
      });
      await handleGetAbapGitErrorLog(context(R1), {
        repository_key: REPO_KEY,
        app_log_key: 'K',
      });
    } finally {
      mock.restoreAll();
    }
    const legacy = new Set(['pull', 'listRepos', 'getErrorLog']);
    assert.deepEqual(
      calls.filter((call) => legacy.has(call.member)),
      [],
    );
    for (const member of ['link', 'checkExternalRepo']) {
      const call = calls.find((each) => each.member === member);
      assert.ok(call, member);
      const options = call.options;
      assert.ok(
        typeof options === 'object' &&
          options !== null &&
          'credentials' in options,
        `${member} is called with a credentials key`,
      );
    }
    assert.equal(calls.length, 13);
  });
});
