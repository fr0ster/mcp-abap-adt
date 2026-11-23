/**
 * The compact abapGit tools (spec §4.2, T6.6): `HandlerAbapGitGet` in the
 * compact and compact read-only sets, `HandlerAbapGit` in the compact set;
 * each variant's enum holds only what that system kind serves; each action
 * is deniable; each action reaches its full tool's path with the same
 * handoff — the same request, the same answer.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AbapGitAdmission } from '../../../lib/abapGit/admission';
import { NARROWINGS } from '../../../lib/access/narrowing';
import {
  abapGitReadEntries,
  abapGitWriteEntries,
} from '../../../lib/handlers/groups/AbapGitHandlersGroup';
import type {
  HandlerEntry,
  ToolArgs,
  ToolDefinition,
} from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import { declareSystemKind } from '../../../lib/systemKind';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
} from '../../../lib/toolSet';
import {
  ADMITTED_REPO,
  answerText,
  BOUND_CREDENTIALS,
  contextOn,
  exception,
  externalRepo,
  modifiedObjects,
  noObjects,
  objectResults,
  REPO_KEY,
  REPO_URL,
  reposDocument,
  staging,
  stubSap,
} from '../../helpers/abapGitSap';
import { toolAnswer } from '../../helpers/toolAnswer';

const SERVED = { dataTools: false };
const HALVES = { readOnly: () => [], data: () => [], modify: () => [] };

function compactEntries(readOnly: boolean): HandlerEntry[] {
  const set = readOnly
    ? compactReadOnlyToolSetOf(HALVES)
    : compactToolSetOf(HALVES);
  return set
    .groups(noConnectionContext(), 'stdio', SERVED)
    .flatMap((group) => group.getHandlers());
}

function compactEntry(name: string): HandlerEntry {
  const found = compactEntries(false).find(
    (entry) => entry.toolDefinition.name === name,
  );
  assert.ok(found, name);
  return found;
}

/** The values `action` takes in `definition` on `kind`. */
function actionsOn(definition: ToolDefinition, kind: 'onprem' | 'cloud') {
  const schema =
    definition.variants?.[kind].inputSchema ?? definition.inputSchema;
  const values: string[] = [];
  for (const candidate of [
    'repos',
    'external_repo',
    'modified_objects',
    'staging',
    'checks',
    'file',
    'error_log',
    'link',
    'unlink',
    'pull',
    'push',
    'switch_branch',
    'branch_info',
  ]) {
    const action = schema.shape.action;
    if (action?.safeParse(candidate).success === true) values.push(candidate);
  }
  return values;
}

describe('the compact abapGit tools: registration', () => {
  it('the compact set registers both, the compact read-only set the reads alone', () => {
    const names = (readOnly: boolean) =>
      compactEntries(readOnly)
        .map((entry) => entry.toolDefinition.name)
        .filter((name) => name.startsWith('HandlerAbapGit'));
    assert.deepEqual(names(false).sort(), [
      'HandlerAbapGit',
      'HandlerAbapGitGet',
    ]);
    assert.deepEqual(names(true), ['HandlerAbapGitGet']);
  });

  it('each enum holds only what its system kind serves', () => {
    const get = compactEntry('HandlerAbapGitGet').toolDefinition;
    assert.deepEqual(actionsOn(get, 'onprem'), [
      'repos',
      'external_repo',
      'staging',
      'checks',
      'file',
    ]);
    assert.deepEqual(actionsOn(get, 'cloud'), [
      'repos',
      'external_repo',
      'modified_objects',
      'staging',
      'checks',
      'file',
      'error_log',
    ]);
    const write = compactEntry('HandlerAbapGit').toolDefinition;
    assert.deepEqual(actionsOn(write, 'onprem'), [
      'link',
      'unlink',
      'pull',
      'push',
      'switch_branch',
    ]);
    assert.deepEqual(actionsOn(write, 'cloud'), [
      'link',
      'unlink',
      'pull',
      'push',
      'branch_info',
    ]);
  });

  it("a property no offered action takes is left out; folder_logic is cloud's link's", () => {
    const keys = (definition: ToolDefinition, kind: 'onprem' | 'cloud') =>
      Object.keys(
        (definition.variants?.[kind].inputSchema ?? definition.inputSchema)
          .shape,
      );
    const get = compactEntry('HandlerAbapGitGet').toolDefinition;
    assert.equal(keys(get, 'onprem').includes('app_log_key'), false);
    assert.equal(keys(get, 'cloud').includes('app_log_key'), true);
    const write = compactEntry('HandlerAbapGit').toolDefinition;
    assert.equal(keys(write, 'onprem').includes('folder_logic'), false);
    assert.equal(keys(write, 'cloud').includes('folder_logic'), true);
    assert.equal(keys(write, 'onprem').includes('create'), true);
    assert.equal(keys(write, 'cloud').includes('create'), false);
    assert.equal(keys(write, 'onprem').includes('overwrite'), false);
    assert.equal(keys(write, 'cloud').includes('overwrite'), true);
  });

  it('each action is deniable: the narrowed enum leaves the denied one out', () => {
    const narrowing = NARROWINGS.get('HandlerAbapGit');
    assert.ok(narrowing);
    for (const kind of ['onprem', 'cloud'] as const) {
      const kept = narrowing.values(kind).filter((value) => value !== 'push');
      const narrowed = narrowing.definition(kind, kept, undefined);
      assert.equal(
        narrowed.inputSchema.shape.action?.safeParse('push').success,
        false,
      );
      assert.equal(
        narrowed.inputSchema.shape.action?.safeParse('pull').success,
        true,
      );
      assert.equal(narrowed.description.includes('push('), false);
    }
    const get = NARROWINGS.get('HandlerAbapGitGet');
    assert.ok(get);
    assert.deepEqual(get.values('onprem'), [
      'repos',
      'external_repo',
      'staging',
      'checks',
      'file',
    ]);
  });
});

const R1: AbapGitAdmission = {
  repo: ADMITTED_REPO,
  credentials: BOUND_CREDENTIALS,
};
const URL_ROUTE: AbapGitAdmission = {
  sendUrl: REPO_URL,
  credentials: BOUND_CREDENTIALS,
};

/** Each action, its arguments, its admission and what SAP answers. */
const CASES: ReadonlyArray<{
  readonly compact: 'HandlerAbapGitGet' | 'HandlerAbapGit';
  readonly action: string;
  readonly kind: 'onprem' | 'cloud';
  readonly args: ToolArgs;
  readonly admission: AbapGitAdmission;
  readonly data: string;
  readonly status?: number;
}> = [
  {
    compact: 'HandlerAbapGitGet',
    action: 'repos',
    kind: 'onprem',
    args: { repository_key: REPO_KEY, detail: 'medium' },
    admission: {},
    data: reposDocument,
  },
  {
    compact: 'HandlerAbapGitGet',
    action: 'external_repo',
    kind: 'onprem',
    args: { url: REPO_URL },
    admission: URL_ROUTE,
    data: externalRepo(),
  },
  {
    compact: 'HandlerAbapGitGet',
    action: 'modified_objects',
    kind: 'cloud',
    args: { repository_key: REPO_KEY, detail: 'full' },
    admission: R1,
    data: modifiedObjects,
  },
  {
    compact: 'HandlerAbapGitGet',
    action: 'staging',
    kind: 'onprem',
    args: { repository_key: REPO_KEY, detail: 'medium' },
    admission: R1,
    data: staging,
  },
  {
    compact: 'HandlerAbapGitGet',
    action: 'checks',
    kind: 'cloud',
    args: { repository_key: REPO_KEY },
    admission: R1,
    data: exception({ httpStatus: '403' }),
    status: 500,
  },
  {
    compact: 'HandlerAbapGitGet',
    action: 'file',
    kind: 'onprem',
    args: { repository_key: REPO_KEY, filename: 'f.abap', version: 'remote' },
    admission: R1,
    data: 'REPORT z.',
  },
  {
    compact: 'HandlerAbapGitGet',
    action: 'error_log',
    kind: 'cloud',
    args: { repository_key: REPO_KEY, app_log_key: ADMITTED_REPO.appLogKey },
    admission: R1,
    data: objectResults,
  },
  {
    compact: 'HandlerAbapGit',
    action: 'link',
    kind: 'cloud',
    args: {
      package_name: 'ZPKG',
      url: REPO_URL,
      branch: 'refs/heads/main',
      folder_logic: 'PREFIX',
    },
    admission: URL_ROUTE,
    data: noObjects,
  },
  {
    compact: 'HandlerAbapGit',
    action: 'unlink',
    kind: 'onprem',
    args: { repository_key: REPO_KEY },
    admission: R1,
    data: '',
  },
  {
    compact: 'HandlerAbapGit',
    action: 'pull',
    kind: 'cloud',
    args: { repository_key: REPO_KEY, transport_request: 'DEVK900001' },
    admission: R1,
    data: '',
    status: 202,
  },
  {
    compact: 'HandlerAbapGit',
    action: 'push',
    kind: 'onprem',
    args: {
      repository_key: REPO_KEY,
      objects: [],
      comment: 'c',
      author: { name: 'a', email: 'a@example.invalid' },
      committer: { name: 'c', email: 'c@example.invalid' },
    },
    admission: R1,
    data: '',
  },
  {
    compact: 'HandlerAbapGit',
    action: 'switch_branch',
    kind: 'onprem',
    args: { repository_key: REPO_KEY, branch: 'refs/heads/x', create: true },
    admission: R1,
    data: '',
  },
  {
    compact: 'HandlerAbapGit',
    action: 'branch_info',
    kind: 'cloud',
    args: {
      url: REPO_URL,
      branch: 'refs/heads/main',
      package_name: 'ZPKG',
    },
    admission: URL_ROUTE,
    data: externalRepo({ folderLogic: true }),
  },
];

const FULL_TOOL: Readonly<Record<string, string>> = {
  repos: 'ListAbapGitRepos',
  external_repo: 'CheckAbapGitExternalRepo',
  modified_objects: 'GetAbapGitModifiedObjects',
  staging: 'GetAbapGitStaging',
  checks: 'CheckAbapGitRepo',
  file: 'GetAbapGitFile',
  error_log: 'GetAbapGitErrorLog',
  link: 'LinkAbapGitRepo',
  unlink: 'UnlinkAbapGitRepo',
  pull: 'PullAbapGitRepo',
  push: 'PushAbapGitRepo',
  switch_branch: 'SwitchAbapGitBranch',
  branch_info: 'GetAbapGitBranchInfo',
};

async function runEntry(
  entry: HandlerEntry,
  each: (typeof CASES)[number],
  args: ToolArgs,
) {
  const sap = stubSap(() => ({ status: each.status ?? 200, data: each.data }));
  declareSystemKind(sap.connection, each.kind);
  const result = await entry.call(
    contextOn(sap.connection, each.admission),
    args,
  );
  return {
    sent: sap.sent.map((request) => ({
      method: request.method,
      url: request.url,
      data: request.data,
      headers: request.headers,
      stateless: request.stateless,
    })),
    text: answerText(toolAnswer(result)),
  };
}

describe('the compact abapGit tools: each action is its full tool', () => {
  for (const each of CASES) {
    it(`${each.compact} ${each.action} sends and answers as ${FULL_TOOL[each.action]}`, async () => {
      const fullName = FULL_TOOL[each.action];
      const full = [...abapGitReadEntries(), ...abapGitWriteEntries()].find(
        (entry) => entry.toolDefinition.name === fullName,
      );
      assert.ok(full, fullName);
      const viaFull = await runEntry(full, each, each.args);
      const viaCompact = await runEntry(compactEntry(each.compact), each, {
        action: each.action,
        ...each.args,
      });
      assert.equal(viaFull.sent.length, 1);
      assert.deepEqual(viaCompact, viaFull);
    });
  }

  it('HandlerAbapGit pull with overwrite sends and answers as PullAbapGitRepo: R6, then the selected entries', async () => {
    const full = abapGitWriteEntries().find(
      (entry) => entry.toolDefinition.name === 'PullAbapGitRepo',
    );
    assert.ok(full);
    const args = {
      repository_key: REPO_KEY,
      overwrite: [{ type: 'CLAS/OC', name: 'ZCL_DEMO' }],
    };
    const through = async (entry: HandlerEntry, callArgs: ToolArgs) => {
      const sap = stubSap((request) =>
        request.method === 'GET'
          ? { status: 200, data: modifiedObjects }
          : { status: 202, data: '' },
      );
      declareSystemKind(sap.connection, 'cloud');
      const result = await entry.call(contextOn(sap.connection, R1), callArgs);
      return {
        sent: sap.sent.map((request) => ({
          method: request.method,
          url: request.url,
          data: request.data,
          headers: request.headers,
        })),
        text: answerText(toolAnswer(result)),
      };
    };
    const viaFull = await through(full, args);
    const viaCompact = await through(compactEntry('HandlerAbapGit'), {
      action: 'pull',
      ...args,
    });
    assert.equal(viaFull.sent.length, 2);
    assert.equal(String(viaFull.sent[1]?.data).includes('ZCL_DEMO'), true);
    assert.deepEqual(viaCompact, viaFull);
  });

  it("an action's missing argument is refused naming its full tool, nothing sent", async () => {
    const sap = stubSap();
    declareSystemKind(sap.connection, 'onprem');
    await assert.rejects(
      compactEntry('HandlerAbapGitGet').call(contextOn(sap.connection, R1), {
        action: 'file',
        repository_key: REPO_KEY,
      }),
      /GetAbapGitFile/,
    );
    assert.equal(sap.sent.length, 0);
  });
});
