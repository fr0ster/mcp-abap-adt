/**
 * The refusal stop (plan C2 Step 3), on the ADT stand-in: a credential
 * refusal — a call that **ends** refused — latches the run's marker
 * wherever a request can go, and from then on nothing is sent. A credential
 * that renews (a `401`, renewed, resent, a `200`) latches nothing.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { openFreshConnection } from '../../../lib/packageSessions';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { corpusBody } from '../../helpers/adtCorpus';
import {
  type AdtStandIn,
  adtStandIn,
  isLogoff,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { repositoryRoot } from '../../helpers/repoRoot';
import { stateSystemKind } from '../../helpers/systemKind';
import { setUpLiveRun } from '../../integration/globalSetup';
import { logOffLeft } from '../../integration/helpers/debuggerCleanup';
import {
  currentTestOf,
  deleteRecorded,
  expectAbsent,
  expectCleared,
  expectNameFree,
  liveCall,
  recordCreated,
  resetLiveRecords,
  softRunner,
  useCurrentTest,
  useLiveRunner,
} from '../../integration/helpers/live';
import { assertEquals } from '../../integration/helpers/liveAssert';
import {
  credentialRefused,
  type GuardedConnection,
  guardedTestConnection,
  markCredentialRefused,
  REFUSED_AFTER_MARKER,
} from '../../integration/helpers/refusalGuard';
import { createTestConnectionAndSession } from '../../integration/helpers/sessionHelpers';

const REPO = repositoryRoot(__dirname);
const USER = 'STOP_USER';
const PASSWORD = 'stop-password';
const REALM = 'STAND IN REALM';

let stand: AdtStandIn;
let runDir: string;
let savedKind: string | undefined;

const settingsOf = (url: string): SapConfig => ({
  url,
  client: '100',
  authType: 'basic',
  username: USER,
});

beforeEach(async (t) => {
  // The helpers are called as a liveSuite case calls them.
  if ('fullName' in t) useCurrentTest(currentTestOf(t));
  resetLiveRecords();
  savedKind = process.env.SAP_SYSTEM_TYPE;
  stateSystemKind();
  setSystemContext({ responsible: USER });
  runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refusal-stop-'));
  process.env.MCP_ABAP_ADT_COVERAGE_RUN = runDir;
  stand = await adtStandIn();
});

afterEach(async () => {
  useCurrentTest(undefined);
  useLiveRunner(undefined);
  await stand.close();
  delete process.env.MCP_ABAP_ADT_COVERAGE_RUN;
  resetSystemContextCache();
  if (savedKind === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = savedKind;
  fs.rmSync(runDir, { recursive: true, force: true });
});

/** A guarded connection to the stand-in with `credential` (basic by default). */
const guarded = (
  credential: IAuthProvider = new BasicAuthProvider(USER, PASSWORD),
): GuardedConnection =>
  guardedTestConnection(settingsOf(stand.url), credential, { kind: 'onprem' });

/** A soft live runner on a guarded connection, its in-process server on the same. */
async function liveOn(connection: GuardedConnection): Promise<void> {
  await connection.connect();
  useLiveRunner(
    softRunner({
      system: 'onprem',
      user: USER,
      connection,
      source: { injected: connection },
    }),
  );
}

/**
 * A credential that renews: a basic one whose answer to the first
 * `renewals` rejections is Ok (renewed), so the connection resends.
 */
function renewing(renewals: number): IAuthProvider & { renewed(): number } {
  const basic = new BasicAuthProvider(USER, PASSWORD);
  let renewed = 0;
  return {
    kind: basic.kind,
    prepare: () => basic.prepare(),
    establish: (logon) => basic.establish(logon),
    authorize: (request) => basic.authorize(request),
    rejected: async (rejection) => {
      if (renewed < renewals) {
        renewed += 1;
        return { ok: true };
      }
      return basic.rejected(rejection);
    },
    renewed: () => renewed,
  };
}

const sentSince = (from: number): string[] =>
  stand.requests.slice(from).map((r) => `${r.method} ${r.url.split('?')[0]}`);

const isPut = (request: StandInRequest): boolean => request.method === 'PUT';
const isProgramRead = (request: StandInRequest): boolean =>
  request.method === 'GET' &&
  request.url.startsWith('/sap/bc/adt/programs/programs/zstop_prog');

/** A plain read; `timeout: 0` is axios' "none" — no deadline of ours. */
const DISCOVERY = { url: '/sap/bc/adt/discovery', method: 'GET', timeout: 0 };

describe('the refusal stop at the connection', () => {
  it('a credential refusal in globalSetup fails the setup', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refusal-setup-'));
    const event = process.env.npm_lifecycle_event;
    const configFile = process.env.MCP_TEST_CONFIG;
    // Without a credential: 401 and the realm; with one: refused too.
    stand.respond(
      () => true,
      () => ({
        status: 401,
        headers: { 'www-authenticate': `Basic realm="${REALM}"` },
      }),
    );
    try {
      fs.mkdirSync(path.join(dir, 'sessions'));
      fs.writeFileSync(
        path.join(dir, 'sessions', 'STAND.env'),
        [
          `SAP_URL=${stand.url}`,
          'SAP_CLIENT=100',
          'SAP_AUTH_TYPE=basic',
          'SAP_CONNECTION_TYPE=http',
          `SAP_USERNAME=${USER}`,
          `SAP_PASSWORD=${PASSWORD}`,
          '',
        ].join('\n'),
      );
      const config = path.join(dir, 'test-config.yaml');
      fs.writeFileSync(
        config,
        [
          'auth_broker:',
          `  paths: { service_keys_dir: ${JSON.stringify(dir)} }`,
          '  abap: { destination: STAND }',
          '  browser: none',
          'environment:',
          '  system_type: onprem',
          `  expected_realm: ${JSON.stringify(REALM)}`,
          '',
        ].join('\n'),
      );
      process.env.MCP_TEST_CONFIG = config;
      process.env.npm_lifecycle_event = 'test:integration';
      await assert.rejects(
        setUpLiveRun({ rootDir: REPO, named: [] }),
        (error: unknown) =>
          error instanceof Error && error.message.includes('was refused'),
      );
      assert.equal(credentialRefused(), true);
      // The realm check without a credential, then the refused logon.
      assert.equal(stand.requests[0]?.authorization, undefined);
      assert.equal(
        stand.requests.some((r) => r.authorization !== undefined),
        true,
      );
    } finally {
      if (event === undefined) delete process.env.npm_lifecycle_event;
      else process.env.npm_lifecycle_event = event;
      if (configFile === undefined) delete process.env.MCP_TEST_CONFIG;
      else process.env.MCP_TEST_CONFIG = configFile;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a logon refused latches the marker, and no connection is created after it', async () => {
    stand.refuse(true);
    await assert.rejects(guarded().connect());
    assert.equal(credentialRefused(), true);
    const sent = stand.requests.length;
    assert.throws(() => guarded(), REFUSED_AFTER_MARKER);
    assert.equal(stand.requests.length, sent);
  });

  it('no connection is created after the marker', async () => {
    markCredentialRefused();
    assert.throws(() => guarded(), REFUSED_AFTER_MARKER);
    assertEquals(stand.requests, []);
  });

  it('cleanup, name-free reads and the debugger and session helpers send nothing after the marker', async () => {
    const connection = guarded();
    await liveOn(connection);
    recordCreated('DeleteProgram', { program_name: 'ZSTOP_PROG' });
    markCredentialRefused();
    const sent = stand.requests.length;
    const read = { tool: 'GetProgram', args: { program_name: 'ZSTOP_PROG' } };
    await assert.rejects(expectNameFree(read), REFUSED_AFTER_MARKER);
    await assert.rejects(expectAbsent(read), REFUSED_AFTER_MARKER);
    await assert.rejects(expectCleared(read), REFUSED_AFTER_MARKER);
    await assert.rejects(deleteRecorded(), REFUSED_AFTER_MARKER);
    await assert.rejects(
      logOffLeft(new Set(), 'the case'),
      REFUSED_AFTER_MARKER,
    );
    await assert.rejects(
      createTestConnectionAndSession(),
      REFUSED_AFTER_MARKER,
    );
    await assert.rejects(connection.disconnect(), REFUSED_AFTER_MARKER);
    assert.equal(stand.requests.length, sent);
  });

  it('a refusal on a connected path latches before the next send', async () => {
    const connection = guarded();
    await liveOn(connection);
    recordCreated('DeleteProgram', { program_name: 'ZSTOP_PROG' });
    stand.refuse(true);
    const answer = await liveCall('GetProgram', { program_name: 'ZSTOP_PROG' });
    assert.equal(answer.isError, true);
    assert.equal(credentialRefused(), true);
    const sent = stand.requests.length;
    const read = { tool: 'GetProgram', args: { program_name: 'ZSTOP_PROG' } };
    await assert.rejects(
      liveCall('GetProgram', { program_name: 'ZSTOP_PROG' }),
      REFUSED_AFTER_MARKER,
    );
    await assert.rejects(expectAbsent(read), REFUSED_AFTER_MARKER);
    await assert.rejects(deleteRecorded(), REFUSED_AFTER_MARKER);
    await assert.rejects(
      logOffLeft(new Set(), 'the case'),
      REFUSED_AFTER_MARKER,
    );
    // Below the helpers, the connection itself refuses.
    await assert.rejects(
      connection.makeAdtRequest(DISCOVERY),
      REFUSED_AFTER_MARKER,
    );
    assert.equal(stand.requests.length, sent);
  });

  it('within one tool call nothing follows a refused request', async () => {
    const connection = guarded();
    await liveOn(connection);
    stand.answer(isPut, 401);
    const from = stand.requests.length;
    const answer = await liveCall('UpdateProgram', {
      program_name: 'ZSTOP_PROG',
      source_code: "REPORT zstop_prog.\nWRITE 'x'.",
    });
    assert.equal(answer.isError, true);
    assert.equal(credentialRefused(), true);
    assertEquals(sentSince(from), [
      'POST /sap/bc/adt/programs/programs/zstop_prog',
      'PUT /sap/bc/adt/programs/programs/zstop_prog/source/main',
    ]);
    assert.equal(
      stand.requests.some((r) => isLogoff(r.url)),
      false,
    );
  });

  it('a terminal refusal on a sibling connection stops every connection', async () => {
    const first = guarded();
    await first.connect();
    const sibling = await openFreshConnection(first, silent);
    const own = stand.requests[stand.requests.length - 1]?.session;
    // The sibling's own session is refused; the first's is not.
    stand.respond(
      (request) => request.session === own,
      () => ({ status: 401 }),
    );
    await assert.rejects(sibling.makeAdtRequest(DISCOVERY));
    assert.equal(credentialRefused(), true);
    const sent = stand.requests.length;
    await assert.rejects(
      sibling.makeAdtRequest(DISCOVERY),
      REFUSED_AFTER_MARKER,
    );
    await assert.rejects(first.makeAdtRequest(DISCOVERY), REFUSED_AFTER_MARKER);
    assert.equal(stand.requests.length, sent);
  });

  it('a sibling of a guarded connection is guarded', async () => {
    const first = guarded();
    await first.connect();
    const sibling = await openFreshConnection(first, silent);
    const ownSession = stand.requests[stand.requests.length - 1]?.session;
    assert.notEqual(ownSession, stand.requests[0]?.session);
    markCredentialRefused();
    const sent = stand.requests.length;
    await assert.rejects(
      sibling.makeAdtRequest(DISCOVERY),
      REFUSED_AFTER_MARKER,
    );
    await assert.rejects(
      openFreshConnection(first, silent),
      REFUSED_AFTER_MARKER,
    );
    assert.equal(stand.requests.length, sent);
  });

  it('a failure that is not the credential latches nothing', async () => {
    const connection = guarded();
    await connection.connect();
    stand.answer(
      (request) => request.url.startsWith('/sap/bc/adt/discovery'),
      403,
    );
    await assert.rejects(connection.makeAdtRequest(DISCOVERY));
    stand.answer(
      (request) => request.url.startsWith('/sap/bc/adt/probe/'),
      500,
    );
    await assert.rejects(
      connection.makeAdtRequest({ ...DISCOVERY, url: '/sap/bc/adt/probe/x' }),
    );
    assert.equal(credentialRefused(), false);
  });

  it('a renewed credential latches nothing', async () => {
    const credential = renewing(1);
    const connection = guarded(credential);
    await liveOn(connection);
    stand.answerOnce(isPut, 401);
    const from = stand.requests.length;
    const answer = await liveCall('UpdateProgram', {
      program_name: 'ZSTOP_PROG',
      source_code: "REPORT zstop_prog.\nWRITE 'x'.",
    });
    assert.equal(answer.isError, false);
    assert.equal(credential.renewed(), 1);
    assert.equal(credentialRefused(), false);
    const sent = sentSince(from);
    assert.equal(sent.filter((line) => line.startsWith('PUT ')).length, 2);
    assert.equal(
      stand.requests.slice(from).some((r) => r.url.includes('_action=UNLOCK')),
      true,
    );
  });

  it('a renewed credential on a read latches nothing', async () => {
    const credential = renewing(1);
    await liveOn(guarded(credential));
    stand.answerOnce(isProgramRead, 401);
    const answer = await liveCall('GetProgram', { program_name: 'ZSTOP_PROG' });
    assert.equal(answer.isError, false);
    assert.equal(credential.renewed(), 1);
    assert.equal(credentialRefused(), false);
  });

  it('a renewed credential on a cleanup request latches nothing', async () => {
    // SAP's answers to a deletion check and a deletion, as captured.
    stand.body(
      (request) => request.url.startsWith('/sap/bc/adt/deletion/check'),
      corpusBody('deletion-check-allows--01-deletion-check'),
    );
    stand.body(
      (request) => request.url.startsWith('/sap/bc/adt/deletion/delete'),
      corpusBody('delete-success--01-deletion-delete'),
    );
    const credential = renewing(1);
    await liveOn(guarded(credential));
    recordCreated('DeleteProgram', { program_name: 'ZSTOP_PROG' });
    stand.answerOnce(
      (request) => request.url.startsWith('/sap/bc/adt/deletion/delete'),
      401,
    );
    assert.equal(await deleteRecorded(), undefined);
    assert.equal(credential.renewed(), 1);
    assert.equal(credentialRefused(), false);
  });
});

const silent = { info() {}, debug() {}, warn() {}, error() {} };
