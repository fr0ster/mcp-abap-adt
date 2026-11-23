/**
 * abapGit's background runs (spec §4.6, T6.7): on premise, link, pull and
 * push may run as a code run (`background: true`, no default); no cloud
 * schema declares it, and another action given it is refused. Through a
 * real stdio dispatch against an ADT stand-in:
 *
 * - an admitted background pull reads exactly one credential-free R1 (the
 *   admission's, handed to the run in memory), and runs on a connection of
 *   its own;
 * - the run's record holds the tool, its object and its start only;
 * - `DiscardBackgroundRun` cannot cut it while it runs; its answer is the
 *   tool's facts;
 * - a stdio close logs the run's connection off (it cuts SAP's dialog);
 * - `background: true` without a background-run store is refused, nothing
 *   sent.
 *
 * With a bound credential whose user and token are canaries, over HTTP and
 * over RFC (the connector's real `RfcTransport` on the stand-in's RFC path,
 * its wire log asked for): R1 carries no git credential, the pull carries it
 * in its body alone, and the record, the stored answer and the wire log hold
 * no canary.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { AdtOnPremConnector, RfcTransport } from '@mcp-abap-adt/connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { IDestinations } from '../../../../server-runtime/src/stdio/auth/IAuthBrokerFactory';
import { StdioServer } from '../../../../server-runtime/src/stdio/StdioServer';
import {
  NO_ABAPGIT_RESTRICTIONS,
  rawAbapGitRefusal,
} from '../../../lib/abapGit/admission';
import type { ApprovedEndpoint } from '../../../lib/abapGit/approvedEndpoints';
import { parseApprovedEndpoints } from '../../../lib/abapGit/approvedEndpoints';
import { serverRefusalOf } from '../../../lib/auth/serverRefusal';
import {
  BACKGROUND_TOOLS,
  backgroundObjectOf,
} from '../../../lib/backgroundRuns/tools';
import { compactAbapGitEntries } from '../../../lib/compact/abapGit/group';
import { CompactBackgroundRunHandlersGroup } from '../../../lib/compact/backgroundRuns/group';
import { notifyConnectionResetListeners } from '../../../lib/connectionEvents';
import { AbapGitHandlersGroup } from '../../../lib/handlers/groups/AbapGitHandlersGroup';
import { BackgroundRunHandlersGroup } from '../../../lib/handlers/groups/BackgroundRunHandlersGroup';
import {
  BaseHandlerGroup,
  type HandlerEntry,
  type ToolDefinition,
} from '../../../lib/handlers/index';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import {
  ALL_CANARIES,
  CANARIES,
  noObjects,
  objectResults,
  pathOf,
  REPO_KEY,
  REPO_URL,
  reposDocument,
} from '../../helpers/abapGitSap';
import {
  type AdtStandIn,
  adtStandIn,
  rfcPathTo,
  type StandInRequest,
  type StandInRfcPath,
} from '../../helpers/adtStandIn';
import { connectionCreate } from '../../helpers/packageFiles';

const SERVED_DISCOVERY =
  '<?xml version="1.0" encoding="utf-8"?><app:service xmlns:app="http://www.w3.org/2007/app"><app:workspace>' +
  '<app:collection href="/sap/bc/adt/abapgit/repos"/>' +
  '</app:workspace></app:service>';

const isDiscovery = (request: StandInRequest) =>
  pathOf(request.url) === '/sap/bc/adt/discovery';
const isR1 = (request: StandInRequest) =>
  request.method === 'GET' &&
  pathOf(request.url) === '/sap/bc/adt/abapgit/repos';
const isPull = (request: StandInRequest) =>
  request.method === 'POST' &&
  pathOf(request.url) === `/sap/bc/adt/abapgit/repos/${REPO_KEY}/pull`;
const isLink = (request: StandInRequest) =>
  request.method === 'POST' &&
  pathOf(request.url) === '/sap/bc/adt/abapgit/repos';
const isLogoff = (request: StandInRequest) =>
  request.url === '/sap/public/bc/icf/logoff';

const ABAPGIT_WRITES = [
  'LinkAbapGitRepo',
  'PullAbapGitRepo',
  'PushAbapGitRepo',
  'HandlerAbapGit',
];

function definitions(): ToolDefinition[] {
  return [
    ...new AbapGitHandlersGroup(noConnectionContext()).getHandlers(),
    ...compactAbapGitEntries('all'),
  ].map((entry) => entry.toolDefinition);
}

function declaresOn(definition: ToolDefinition, kind: 'onprem' | 'cloud') {
  const schema =
    definition.variants?.[kind].inputSchema ?? definition.inputSchema;
  return Object.hasOwn(schema.shape, 'background');
}

describe('background on the abapGit writes: the schemas', () => {
  it('the on-premise schemas of link, pull, push and HandlerAbapGit declare it, as the list names them', () => {
    const onprem = definitions()
      .filter((definition) => declaresOn(definition, 'onprem'))
      .map((definition) => definition.name)
      .sort();
    assert.deepEqual(onprem, [...ABAPGIT_WRITES].sort());
    for (const name of ABAPGIT_WRITES) {
      assert.ok(Object.hasOwn(BACKGROUND_TOOLS, name), name);
    }
  });

  it('no cloud schema declares it', () => {
    assert.deepEqual(
      definitions()
        .filter((definition) => declaresOn(definition, 'cloud'))
        .map((definition) => definition.name),
      [],
    );
  });

  it('another compact action given background is refused, before anything', () => {
    const refused = rawAbapGitRefusal(
      {
        tool: 'HandlerAbapGit',
        args: { action: 'unlink', repository_key: REPO_KEY, background: true },
      },
      NO_ABAPGIT_RESTRICTIONS,
      { kind: 'onprem', deniedAction: () => undefined },
    );
    assert.equal(
      serverRefusalOf(refused)?.code,
      'abapgit_background_not_declared',
    );
  });

  it("the run's object is chosen per tool and action: link's package, pull's and push's repository key", () => {
    // Both arguments given: the one the tool and action name is taken.
    const both = { package_name: 'zpkg_git', repository_key: REPO_KEY };
    assert.equal(backgroundObjectOf('LinkAbapGitRepo', both), 'ZPKG_GIT');
    assert.equal(
      backgroundObjectOf('HandlerAbapGit', { action: 'link', ...both }),
      'ZPKG_GIT',
    );
    for (const tool of ['PullAbapGitRepo', 'PushAbapGitRepo']) {
      assert.equal(backgroundObjectOf(tool, both), REPO_KEY);
    }
    for (const action of ['pull', 'push']) {
      assert.equal(
        backgroundObjectOf('HandlerAbapGit', { action, ...both }),
        REPO_KEY,
      );
    }
    // A run tool's class or program, as before; never an abapGit argument.
    assert.equal(
      backgroundObjectOf('RunClass', { class_name: 'zcl_run', ...both }),
      'ZCL_RUN',
    );
    assert.equal(backgroundObjectOf('RunClass', both), '');
  });
});

/** A store that keeps each record it was asked to start, as it came. */
class RecordingRuns extends InMemoryBackgroundRuns {
  readonly records: unknown[] = [];
  override start(...args: Parameters<InMemoryBackgroundRuns['start']>) {
    this.records.push(args[1]);
    return super.start(...args);
  }
}

const PROVIDER = new BasicAuthProvider('GIT_USER', 'git-password');

function destinationsOf(sap: AdtStandIn): IDestinations {
  return {
    settingsFor: async () => ({
      url: sap.url,
      client: '100',
      authType: 'basic',
      username: 'GIT_USER',
    }),
    getProvider: async () => PROVIDER,
  };
}

/** The compact background-run tools, as a group of their own. */
class CompactRuns extends BaseHandlerGroup {
  protected groupName = 'CompactRuns';
  getHandlers(): HandlerEntry[] {
    return new CompactBackgroundRunHandlersGroup(
      noConnectionContext(),
    ).getHandlers();
  }
}

async function stdio(
  sap: AdtStandIn,
  backgroundRuns: InMemoryBackgroundRuns | undefined,
  abapGitEndpoints?: readonly ApprovedEndpoint[],
  destinations: IDestinations = destinationsOf(sap),
) {
  const context = noConnectionContext();
  const server = new StdioServer(
    new CompositeHandlersRegistry([
      new AbapGitHandlersGroup(context),
      {
        getName: () => 'compact-abapgit',
        registerHandlers: () => {},
        getHandlers: () => compactAbapGitEntries('all'),
      },
      new BackgroundRunHandlersGroup(context),
      new CompactRuns(context),
    ]),
    destinations,
    {
      systemType: 'onprem',
      ...(backgroundRuns !== undefined ? { backgroundRuns } : {}),
      ...(abapGitEndpoints !== undefined ? { abapGitEndpoints } : {}),
    },
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'abapgit-background', version: '1' });
  await Promise.all([
    server.start('dest', serverSide),
    client.connect(clientSide),
  ]);
  return {
    call: async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      const content: unknown[] = Array.isArray(result.content)
        ? result.content
        : [];
      const texts = content.map((item) =>
        typeof item === 'object' &&
        item !== null &&
        'text' in item &&
        typeof item.text === 'string'
          ? item.text
          : '',
      );
      return {
        isError: result.isError === true,
        text: texts[0] ?? '',
        all: texts.join('\n'),
      };
    },
    close: async () => {
      await client.close().catch(() => undefined);
      await server.terminalClose().catch(() => undefined);
    },
  };
}

/** The run handle a started run answered. */
function handleOf(text: string): string {
  const parsed: unknown = JSON.parse(text);
  assert.ok(
    typeof parsed === 'object' &&
      parsed !== null &&
      'run_handle' in parsed &&
      typeof parsed.run_handle === 'string',
    text,
  );
  return parsed.run_handle;
}

let sap: AdtStandIn;
beforeEach(async () => {
  notifyConnectionResetListeners();
  sap = await adtStandIn();
  sap.body(isDiscovery, SERVED_DISCOVERY);
  sap.body(isR1, reposDocument);
});
afterEach(async () => {
  await sap.close();
  notifyConnectionResetListeners();
});

describe('background on the abapGit writes: a real dispatch', () => {
  it('a background pull reads one credential-free R1; its record holds tool, object and start; a discard cannot cut it', async () => {
    const runs = new RecordingRuns();
    const s = await stdio(sap, runs);
    const held = sap.hold(isPull);
    try {
      const started = await s.call('PullAbapGitRepo', {
        repository_key: REPO_KEY,
        transport_request: 'DEVK900001',
        background: true,
      });
      assert.equal(started.isError, false, started.text);
      const handle = handleOf(started.text);
      await held.arrived;
      const r1 = sap.requests.filter(isR1);
      assert.equal(r1.length, 1, 'exactly one R1');
      assert.equal(r1[0]?.body, '');
      assert.equal(runs.records.length, 1);
      const record = runs.records[0];
      assert.ok(typeof record === 'object' && record !== null);
      assert.deepEqual(Object.keys(record).sort(), [
        'object',
        'started_at',
        'tool',
      ]);
      assert.ok('tool' in record && 'object' in record);
      assert.equal(record.tool, 'PullAbapGitRepo');
      assert.equal(record.object, REPO_KEY);
      const discarded = await s.call('DiscardBackgroundRun', {
        run_handle: handle,
      });
      assert.equal(discarded.isError, true, discarded.text);
      held.release();
      await held.answered;
      let answer = await s.call('GetBackgroundRun', { run_handle: handle });
      for (let i = 0; i < 200 && answer.all.includes('"running"'); i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        answer = await s.call('GetBackgroundRun', { run_handle: handle });
      }
      assert.ok(answer.all.includes('"result":"done"'), answer.all);
      assert.equal(sap.requests.filter(isR1).length, 1, 'no second R1');
    } finally {
      held.release();
      await s.close();
    }
  });

  it('a background pull with a bound credential: R1 carries no git header; the record and the stored answer hold no canary', async () => {
    const runs = new RecordingRuns();
    // SAP echoes the canaries in the pull's object results (msgText).
    sap.body(isPull, objectResults);
    const s = await stdio(
      sap,
      runs,
      parseApprovedEndpoints(
        [{ url: REPO_URL, user: CANARIES.user, token: CANARIES.token }],
        'the test',
      ),
    );
    try {
      const started = await s.call('PullAbapGitRepo', {
        repository_key: REPO_KEY,
        background: true,
      });
      assert.equal(started.isError, false, started.text);
      const handle = handleOf(started.text);
      let answer = await s.call('GetBackgroundRun', { run_handle: handle });
      for (let i = 0; i < 200 && answer.all.includes('"running"'); i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        answer = await s.call('GetBackgroundRun', { run_handle: handle });
      }
      assert.ok(answer.all.includes('"result":"done"'), answer.all);
      const r1 = sap.requests.filter(isR1);
      assert.equal(r1.length, 1);
      for (const request of r1) {
        assert.deepEqual(
          Object.keys(request.headers).filter((name) =>
            name.startsWith('x-abapgit-'),
          ),
          [],
        );
      }
      // The credential did reach the pull (in its body): its absence
      // elsewhere is the server's dropping it.
      const pull = sap.requests.find(isPull);
      assert.equal(pull?.body.includes(CANARIES.user), true);
      for (const request of r1) {
        assert.equal(JSON.stringify(request).includes(CANARIES.user), false);
      }
      const kept = JSON.stringify(runs.records) + answer.all + started.all;
      for (const canary of ALL_CANARIES) {
        assert.equal(kept.includes(canary), false, canary);
      }
    } finally {
      await s.close();
    }
  });

  it("a compact background link records the package, also beside a repository key; a stdio close logs the run's connection off", async () => {
    const runs = new RecordingRuns();
    const s = await stdio(sap, runs);
    const held = sap.hold(isLink);
    try {
      const started = await s.call('HandlerAbapGit', {
        action: 'link',
        package_name: 'zpkg_git',
        repository_key: REPO_KEY,
        url: 'https://git.example.invalid/team/repo.git',
        branch: 'refs/heads/main',
        background: true,
      });
      assert.equal(started.isError, false, started.text);
      await held.arrived;
      const record = runs.records[0];
      assert.ok(typeof record === 'object' && record !== null);
      assert.ok('object' in record);
      assert.equal(record.object, 'ZPKG_GIT');
      assert.equal(sap.requests.filter(isR1).length, 0, 'a link reads no R1');
      const runSession = sap.requests.find(isLink)?.session;
      const closed = s.close();
      held.release();
      await held.answered;
      await closed;
      for (
        let i = 0;
        i < 200 &&
        !sap.requests.some(
          (request) => isLogoff(request) && request.session === runSession,
        );
        i += 1
      ) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.ok(
        sap.requests.some(
          (request) => isLogoff(request) && request.session === runSession,
        ),
        "the run's connection is logged off",
      );
    } finally {
      held.release();
      await s.close();
    }
  });

  it('background: true without a background-run store is refused, nothing sent', async () => {
    sap.body(isPull, noObjects);
    const s = await stdio(sap, undefined);
    try {
      const answer = await s.call('PullAbapGitRepo', {
        repository_key: REPO_KEY,
        background: true,
      });
      assert.equal(answer.isError, true);
      assert.match(answer.text, /background_runs_unavailable/);
      assert.equal(sap.requests.filter(isPull).length, 0);
    } finally {
      await s.close();
    }
  });
});

/** The destination over RFC: an application server, no URL. */
const RFC_DESTINATIONS: IDestinations = {
  settingsFor: async () => ({
    connectionType: 'rfc',
    ashost: 'sap.example.invalid',
    sysnr: '00',
    client: '100',
    language: 'EN',
    authType: 'basic',
    username: 'GIT_USER',
  }),
  getProvider: async () => PROVIDER,
};

describe('background on the abapGit writes over RFC: a real dispatch', () => {
  let rfc: StandInRfcPath;
  const wire: string[] = [];
  const wireLogger = {
    debug: (message: string) => wire.push(message),
    info: (message: string) => wire.push(message),
    warn: (message: string) => wire.push(message),
    error: (message: string) => wire.push(message),
  };
  beforeEach(() => {
    rfc = rfcPathTo(sap);
    wire.length = 0;
    const real = connectionCreate.createConnection;
    // An RFC spec is built on the connector's real RfcTransport over the
    // stand-in's RFC path, its wire log asked for; HTTP as it is.
    mock.method(
      connectionCreate,
      'createConnection',
      (spec: connectionCreate.ConnectionSpec) =>
        spec.transport === 'rfc'
          ? new AdtOnPremConnector(
              spec.config,
              spec.credential,
              new RfcTransport(rfc.conversations, wireLogger, {
                logWire: true,
              }),
              spec.logger,
              spec.sessionId,
            )
          : real(spec),
    );
  });
  afterEach(() => {
    mock.restoreAll();
  });

  it('a background pull with a bound credential: R1 carries none, the pull carries it in its body alone, the record and the stored answer hold no canary', async () => {
    const runs = new RecordingRuns();
    // SAP echoes the canaries in the pull's object results (msgText).
    sap.body(isPull, objectResults);
    const s = await stdio(
      sap,
      runs,
      parseApprovedEndpoints(
        [{ url: REPO_URL, user: CANARIES.user, token: CANARIES.token }],
        'the test',
      ),
      RFC_DESTINATIONS,
    );
    try {
      const started = await s.call('PullAbapGitRepo', {
        repository_key: REPO_KEY,
        background: true,
      });
      assert.equal(started.isError, false, started.text);
      const handle = handleOf(started.text);
      let answer = await s.call('GetBackgroundRun', { run_handle: handle });
      for (let i = 0; i < 200 && answer.all.includes('"running"'); i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        answer = await s.call('GetBackgroundRun', { run_handle: handle });
      }
      assert.ok(answer.all.includes('"result":"done"'), answer.all);
      // Everything went over RFC: every request the stand-in saw was a
      // call carried on a conversation, each logged on over RFC.
      assert.ok(rfc.logons.length > 0, 'logged on over RFC');
      assert.deepEqual(
        sap.requests.map((request) => request.url),
        rfc.carried,
      );
      const r1 = sap.requests.filter(isR1);
      assert.equal(r1.length, 1, 'exactly one R1');
      for (const request of r1) {
        assert.deepEqual(
          Object.keys(request.headers).filter((name) =>
            name.startsWith('x-abapgit-'),
          ),
          [],
        );
      }
      // The credential reached SAP in the pull's body and nowhere else: not
      // R1, not another request, not the pull's URL or headers, not a logon.
      const pull = sap.requests.find(isPull);
      assert.ok(pull !== undefined, 'the pull was sent');
      const carrying = sap.requests.filter((request) =>
        ALL_CANARIES.some((canary) => JSON.stringify(request).includes(canary)),
      );
      assert.deepEqual(carrying, [pull]);
      assert.equal(pull.body.includes(CANARIES.user), true);
      assert.deepEqual(
        ALL_CANARIES.filter((canary) =>
          (pull.url + JSON.stringify(pull.headers)).includes(canary),
        ),
        [],
      );
      assert.deepEqual(
        ALL_CANARIES.filter((canary) =>
          JSON.stringify(rfc.logons).includes(canary),
        ),
        [],
      );
      const kept =
        JSON.stringify(runs.records) +
        answer.all +
        started.all +
        wire.join('\n');
      for (const canary of ALL_CANARIES) {
        assert.equal(kept.includes(canary), false, canary);
      }
    } finally {
      await s.close();
    }
  });
});
