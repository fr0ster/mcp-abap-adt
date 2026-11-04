/**
 * The live helpers' own behaviour (plan C1 Step 4), on the ADT stand-in, so
 * nothing reaches SAP: the refusal stop, a key's outcome from its test's
 * completed result, cleanup of recorded names only, and the reconciliation
 * of a refused transport request create.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import { runCLI } from 'jest';
import { corpusBody } from '../../../lib/adtCorpus';
import { createAbapConnection } from '../../../lib/connectionFactory';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import {
  type AdtStandIn,
  adtStandIn,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { stateSystemKind } from '../../helpers/systemKind';
import {
  callLog,
  credentialRefused,
  deleteRecorded,
  expectNameFree,
  type LiveRunner,
  leftovers,
  liveCall,
  markCredentialRefused,
  outcomesOf,
  prepareRequestCreate,
  prepareTaskCreate,
  reconcileRequestCreate,
  reconcileTaskCreate,
  recordCreated,
  recordedRequests,
  softRunner,
  useLiveRunner,
} from '../../integration/helpers/live';
import { endTestConnection } from '../../integration/helpers/openConnections';

jest.setTimeout(120_000);

const REPO = path.join(__dirname, '..', '..', '..', '..');
const USER = 'LIVE_USER';

let stand: AdtStandIn;
let runner: LiveRunner;
let runDir: string;
let savedKind: string | undefined;

const settingsOf = (url: string): SapConfig => ({
  url,
  client: '100',
  authType: 'basic',
  username: USER,
});

beforeEach(async () => {
  // A communication batch builds its connection for the kind the
  // environment states, as a launcher's does.
  savedKind = process.env.SAP_SYSTEM_TYPE;
  stateSystemKind();
  // The responsible person a change is made for, as a host states it.
  setSystemContext({ responsible: USER });
  runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-test-'));
  process.env.MCP_ABAP_ADT_COVERAGE_RUN = runDir;
  stand = await adtStandIn();
  const connection = createAbapConnection(
    settingsOf(stand.url),
    new BasicAuthProvider(USER, 'live-password'),
    undefined,
    undefined,
    undefined,
    'onprem',
  );
  await connection.connect();
  runner = softRunner({
    system: 'onprem',
    user: USER,
    connection,
    source: {
      settings: settingsOf(stand.url),
      credential: new BasicAuthProvider(USER, 'live-password'),
    },
  });
  useLiveRunner(runner);
});

afterEach(async () => {
  useLiveRunner(undefined);
  await runner.close();
  await endTestConnection(runner.connection());
  await stand.close();
  delete process.env.MCP_ABAP_ADT_COVERAGE_RUN;
  resetSystemContextCache();
  if (savedKind === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = savedKind;
  fs.rmSync(runDir, { recursive: true, force: true });
});

/** The requests the stand got from `from` on. */
const sentSince = (from: number): StandInRequest[] =>
  stand.requests.slice(from);

const isGet = (prefix: string) => (request: StandInRequest) =>
  request.method === 'GET' && request.url.startsWith(prefix);

describe('liveCall and the refusal stop', () => {
  it('liveCall sends nothing after the refusal marker', async () => {
    await liveCall('GetProgram', { program_name: 'ZLIVE_ONE' });
    const before = stand.requests.length;
    expect(before).toBeGreaterThan(0);
    markCredentialRefused();
    await expect(
      liveCall('GetProgram', { program_name: 'ZLIVE_TWO' }),
    ).rejects.toThrow('a credential was refused earlier in this run');
    await expect(deleteRecorded()).resolves.toBeUndefined();
    recordCreated('DeleteProgram', { program_name: 'ZLIVE_ONE' });
    await expect(deleteRecorded()).rejects.toThrow(
      'a credential was refused earlier in this run',
    );
    expect(stand.requests.length).toBe(before);
  });

  it('a credential refusal answered latches the marker', async () => {
    stand.refuse(true);
    const answer = await liveCall('GetProgram', { program_name: 'ZLIVE_ONE' });
    expect(answer.isError).toBe(true);
    expect(credentialRefused()).toBe(true);
  });

  it('a key is reported covered only after its test passed', async () => {
    const config: unknown = JSON.parse(
      fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'),
    );
    const rootJest: unknown =
      typeof config === 'object' && config !== null
        ? Reflect.get(config, 'jest')
        : undefined;
    const fixtures = path.join(__dirname, '__fixtures__', 'live');
    const { results } = await runCLI(
      {
        _: [],
        $0: 'jest',
        silent: true,
        watchman: false,
        // In a worker of its own, never in this process: a run in band
        // here would tear down the module scope of this very test.
        maxWorkers: 1,
        workerIdleMemoryLimit: '1GB',
        config: JSON.stringify({
          ...(typeof rootJest === 'object' && rootJest !== null
            ? rootJest
            : {}),
          rootDir: REPO,
          roots: [fixtures],
          testMatch: ['**/*.fixture.ts'],
          testPathIgnorePatterns: [],
          globalSetup: undefined,
          reporters: [],
          globals: { COVERAGE_RUN: runDir },
        }),
      },
      [REPO],
    );
    const tests = results.testResults.flatMap((file) =>
      file.testResults.map((test) => ({
        fullName: test.fullName,
        status: test.status,
      })),
    );
    expect(tests).toEqual([
      { fullName: 'calls and passes', status: 'passed' },
      { fullName: 'calls and then fails', status: 'failed' },
    ]);
    expect(callLog()).toEqual([
      { test: 'calls and passes', key: 'GetProgram', system: 'onprem' },
      { test: 'calls and then fails', key: 'GetClass', system: 'onprem' },
    ]);
    expect(Object.fromEntries(outcomesOf(callLog(), tests))).toEqual({
      'GetProgram onprem': 'passed',
      'GetClass onprem': 'failed',
    });
  });
});

describe('cleanup', () => {
  it('deleteRecorded deletes only recorded names, children first', async () => {
    // SAP's answers to a deletion check and a deletion, as captured.
    stand.body(
      (request) => request.url.startsWith('/sap/bc/adt/deletion/check'),
      corpusBody('deletion-check-allows--01-deletion-check'),
    );
    stand.body(
      (request) => request.url.startsWith('/sap/bc/adt/deletion/delete'),
      corpusBody('delete-success--01-deletion-delete'),
    );
    recordCreated('DeleteProgram', { program_name: 'ZLIVE_PARENT' });
    recordCreated('DeleteInclude', { include_name: 'ZLIVE_CHILD' });
    const from = stand.requests.length;
    await deleteRecorded();
    const named = sentSince(from)
      .map((request) => `${request.url} ${request.body}`.toLowerCase())
      .filter((url) => url.includes('zlive_'));
    const firstParent = named.findIndex((url) => url.includes('zlive_parent'));
    const lastChild = named.reduce(
      (last, url, index) => (url.includes('zlive_child') ? index : last),
      -1,
    );
    expect(firstParent).toBeGreaterThan(lastChild);
    expect(lastChild).toBeGreaterThanOrEqual(0);
    expect(
      named.filter(
        (url) => !url.includes('zlive_parent') && !url.includes('zlive_child'),
      ),
    ).toEqual([]);
    const again = stand.requests.length;
    await deleteRecorded();
    expect(stand.requests.length).toBe(again);
  });

  it('expectNameFree fails on an existing name and deletes nothing', async () => {
    const from = stand.requests.length;
    await expect(
      expectNameFree({
        tool: 'GetProgram',
        args: { program_name: 'ZLIVE_TAKEN' },
      }),
    ).rejects.toThrow('is taken');
    expect(
      sentSince(from).filter((request) => request.method !== 'GET'),
    ).toEqual([]);
    stand.answer(isGet('/sap/bc/adt/programs/programs/zlive_free'), 404);
    await expect(
      expectNameFree({
        tool: 'GetProgram',
        args: { program_name: 'ZLIVE_FREE' },
      }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// A transport organizer on the stand-in: the user's modifiable requests, each
// request's tasks, and a create that is refused.

const TM = 'http://www.sap.com/cts/adt/tm';
const ADTCORE = 'http://www.sap.com/adt/core';
const CONFIG_URI =
  '/sap/bc/adt/cts/transportrequests/searchconfiguration/configurations/C1';

interface StandRequest {
  number: string;
  description: string;
  tasks: string[];
}

const escapeXml = (value: string): string =>
  value
    .split('&')
    .join('&amp;')
    .split('"')
    .join('&quot;')
    .split('<')
    .join('&lt;');

/** The organizer: requests by number, a refused create that may leave one behind. */
function organizer(requests: StandRequest[]): void {
  // No communication batch here: the reads go one by one.
  stand.answer(
    (request) =>
      request.method === 'POST' &&
      request.url.startsWith('/sap/bc/adt/communication/batch'),
    404,
  );
  stand.body(
    isGet(
      '/sap/bc/adt/cts/transportrequests/searchconfiguration/configurations',
    ),
    `<?xml version="1.0" encoding="utf-8"?><configurations:configurations xmlns:configurations="http://www.sap.com/adt/configurations"><configuration:configuration xmlns:configuration="http://www.sap.com/adt/configuration"><atom:link href="${CONFIG_URI}" rel="http://www.sap.com/adt/categories/configurations" type="application/vnd.sap.adt.configuration.v1+xml" etag="1" xmlns:atom="http://www.w3.org/2005/Atom"/></configuration:configuration></configurations:configurations>`,
  );
  stand.respond(
    (request) =>
      request.method === 'GET' &&
      request.url.startsWith('/sap/bc/adt/cts/transportrequests?'),
    () => ({
      status: 200,
      text: `<?xml version="1.0" encoding="utf-8"?><tm:root adtcore:name="${USER}" xmlns:tm="${TM}" xmlns:adtcore="${ADTCORE}"><tm:workbench tm:category="Workbench"><tm:modifiable tm:status="Modifiable">${requests
        .map(
          (request) =>
            `<tm:request tm:number="${request.number}" tm:owner="${USER}" tm:desc="${escapeXml(request.description)}" tm:type="K" tm:status="D"/>`,
        )
        .join('')}</tm:modifiable></tm:workbench></tm:root>`,
    }),
  );
  stand.respond(
    (request) =>
      request.method === 'GET' &&
      requests.some((known) =>
        request.url.startsWith(
          `/sap/bc/adt/cts/transportrequests/${known.number}`,
        ),
      ),
    (request) => {
      const known = requests.find((each) =>
        request.url.startsWith(
          `/sap/bc/adt/cts/transportrequests/${each.number}`,
        ),
      );
      const tasks = (known?.tasks ?? [])
        .map((task) => `<tm:task tm:number="${task}" tm:owner="${USER}"/>`)
        .join('');
      return {
        status: 200,
        text: `<?xml version="1.0" encoding="utf-8"?><tm:root adtcore:name="${known?.number ?? ''}" xmlns:tm="${TM}" xmlns:adtcore="${ADTCORE}"><tm:request tm:number="${known?.number ?? ''}" tm:owner="${USER}" tm:desc="${escapeXml(known?.description ?? '')}">${tasks}</tm:request></tm:root>`,
      };
    },
  );
}

/** Every create is refused; `leaves` runs when it arrives (SAP keeping the header, say). */
function refuseCreates(leaves: () => void): void {
  stand.respond(
    (request) =>
      request.method === 'POST' &&
      request.url.startsWith('/sap/bc/adt/cts/transportrequests'),
    () => {
      leaves();
      return {
        status: 400,
        headers: { 'content-type': 'application/xml' },
        text: '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="ExceptionResourceCreationFailure"/><message lang="EN">the task could not be created</message></exc:exception>',
      };
    },
  );
}

describe('a refused transport request create is reconciled', () => {
  it('a refused request create leaves an empty request that is found by its description and journalled', async () => {
    const requests: StandRequest[] = [
      { number: 'K900001', description: 'kept', tasks: [] },
    ];
    organizer(requests);
    const plan = await prepareRequestCreate();
    refuseCreates(() =>
      requests.push({
        number: 'K900002',
        description: plan.description,
        tasks: [],
      }),
    );
    const answer = await liveCall('CreateTransport', {
      description: plan.description,
    });
    expect(answer.isError).toBe(true);
    await expect(reconcileRequestCreate(plan, answer)).rejects.toThrow(
      'its leftover is journalled',
    );
    expect(recordedRequests()).toContain('K900002');
    expect(recordedRequests()).not.toContain('K900001');
  });

  it('a new request with another description is never journalled', async () => {
    const requests: StandRequest[] = [];
    organizer(requests);
    const plan = await prepareRequestCreate();
    refuseCreates(() =>
      requests.push({
        number: 'K900003',
        description: 'someone else',
        tasks: [],
      }),
    );
    const answer = await liveCall('CreateTransport', {
      description: plan.description,
    });
    await expect(reconcileRequestCreate(plan, answer)).rejects.toThrow(
      'left nothing identifiable',
    );
    expect(recordedRequests()).not.toContain('K900003');
  });

  it("a pre-existing request whose description merely looks like the run's is never journalled", async () => {
    const requests: StandRequest[] = [];
    organizer(requests);
    const plan = await prepareRequestCreate();
    // Already there before the create: in the inventory, whatever it says.
    requests.push({
      number: 'K900004',
      description: plan.description,
      tasks: [],
    });
    const replanned = { ...plan, inventory: new Set(['K900004']) };
    refuseCreates(() => {});
    const answer = await liveCall('CreateTransport', {
      description: plan.description,
    });
    await expect(reconcileRequestCreate(replanned, answer)).rejects.toThrow(
      'left nothing identifiable',
    );
    expect(recordedRequests()).not.toContain('K900004');
  });

  it("a refused task create's leftover task is found by the parent's task delta and journalled", async () => {
    const parent: StandRequest = {
      number: 'K900005',
      description: 'parent',
      tasks: ['K900006'],
    };
    organizer([parent]);
    const plan = await prepareTaskCreate(parent.number);
    refuseCreates(() => parent.tasks.push('K900007'));
    const answer = await liveCall('CreateTransportTask', {
      transport_number: parent.number,
      target_user: USER,
    });
    expect(answer.isError).toBe(true);
    await expect(reconcileTaskCreate(plan, answer)).rejects.toThrow(
      'its leftover is journalled',
    );
    expect(recordedRequests()).toContain('K900007');
    expect(recordedRequests()).not.toContain('K900006');
  });

  it('an unidentifiable leftover fails the case and reports the description', async () => {
    organizer([]);
    const plan = await prepareRequestCreate();
    refuseCreates(() => {});
    const answer = await liveCall('CreateTransport', {
      description: plan.description,
    });
    await expect(reconcileRequestCreate(plan, answer)).rejects.toThrow(
      plan.description,
    );
    expect(leftovers()).toEqual([plan.description]);
  });

  it('after a credential refusal nothing is listed and the description is reported', async () => {
    organizer([]);
    const plan = await prepareRequestCreate();
    stand.refuse(true);
    const answer = await liveCall('CreateTransport', {
      description: plan.description,
    });
    const from = stand.requests.length;
    await expect(reconcileRequestCreate(plan, answer)).rejects.toThrow(
      plan.description,
    );
    expect(sentSince(from)).toEqual([]);
    expect(leftovers()).toEqual([plan.description]);
  });
});
