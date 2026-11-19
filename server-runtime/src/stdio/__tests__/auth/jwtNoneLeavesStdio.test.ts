/**
 * Stdio serves no token you hold. A `jwt` / `none` destination — here an
 * `--env` file with `SAP_JWT_TOKEN` and both `SAP_ISSUED_*`, a record of the
 * session store's format, so nothing but the handler table decides — stops
 * the start at the startup check with `destination_refused`, its words
 * and the hint saying where the token goes: the `x-sap-jwt-token` header of
 * `mcp-abap-adt-http` / `mcp-abap-adt-sse`, or `mcp-auth` for stdio. No
 * broker and no provider is built, nothing reaches the system, and the
 * token appears in no line.
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, it, type Mock, mock } from 'node:test';

// Every broker the factory builds is counted; nothing else changes.
import * as authBrokerModule from '@mcp-abap-adt/auth-broker/dist/AuthBroker';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import {
  type AdtStandIn,
  adtStandIn,
} from '../../../../../src/__tests__/helpers/adtStandIn';
import { AuthBrokerFactory } from '../../auth/brokerFactory';
import {
  destinationFailureOf,
  JWT_NONE_HINT,
} from '../../auth/destinationFailure';
import { readCoreConfig } from '../../config/coreParameters';
import { launch } from '../../launcher';
import { StdioServer } from '../../StdioServer';
import {
  type BrokerBase,
  brokerBase,
  recordingLogins,
} from '../helpers/factoryFixture';

/** The launcher's options as `mcp-abap-adt` passes them. */
const TEST_OPTIONS = {
  toolSet: fullToolSet,
  program: 'mcp-abap-adt',
  version: '0.0.0-test',
  packageName: '@mcp-abap-adt/core',
};

const TOKEN = 'held-token-PLACEHOLDER.payload.signature';
/**
 * AuthBroker watched on the module that defines it (the package index
 * re-exports it by getter, read at call time); the real broker is still
 * constructed, as the Jest factory's passthrough did. Every case restores
 * every mock after it, so it is watched afresh before each.
 */
function watchBrokers() {
  return mock.method(authBrokerModule, 'AuthBroker');
}
let constructed: ReturnType<typeof watchBrokers>;

const savedArgv = process.argv;
const savedEnv = { ...process.env };
const savedCwd = process.cwd();

let base: BrokerBase;
let standIn: AdtStandIn;
let stdioStart: Mock<StdioServer['start']>;
let settingsFor: Mock<AuthBrokerFactory['settingsFor']>;
let getProvider: Mock<AuthBrokerFactory['getProvider']>;

beforeEach(async () => {
  base = brokerBase('jwt-none');
  process.chdir(base.root);
  for (const name of [
    'MCP_BROWSER',
    'MCP_BROWSER_PROGRAM',
    'MCP_RENEWAL',
    'MCP_ENV_PATH',
    'MCP_UNSAFE',
    'AUTH_BROKER_PATH',
    'SAP_CONNECTION_TYPE',
    'SAP_SYSTEM_TYPE',
    'MCP_TRANSPORT',
  ]) {
    delete process.env[name];
  }
  standIn = await adtStandIn();
  constructed = watchBrokers();
  stdioStart = mock.method(
    StdioServer.prototype,
    'start',
    async () => undefined,
  );
  // The connection at start is the launcher's own step: not made here.
  mock.method(StdioServer.prototype, 'connectAtStart', async () => ({
    session: 'logged_on',
  }));
  settingsFor = mock.method(AuthBrokerFactory.prototype, 'settingsFor');
  getProvider = mock.method(AuthBrokerFactory.prototype, 'getProvider');
});

afterEach(async () => {
  mock.restoreAll();
  process.argv = savedArgv;
  process.env = { ...savedEnv };
  process.chdir(savedCwd);
  base.remove();
  await standIn.close();
});

it('a jwt / none --env file stops the start: destination_refused, its words and where the token goes', async (t) => {
  const file = base.writeFile('conn.env', [
    `SAP_URL=${standIn.url}`,
    'SAP_CLIENT=100',
    'SAP_AUTH_TYPE=jwt',
    'SAP_CONNECTION_TYPE=http',
    'SAP_GRANT_TYPE=none',
    `SAP_JWT_TOKEN=${TOKEN}`,
    `SAP_ISSUED_FOR=${standIn.url}?sap-client=100`,
    'SAP_ISSUED_BY=placeholder-issuer-record',
  ]);
  process.argv = ['node', 'mcp-abap-adt', `--env-path=${file}`];
  const config = readCoreConfig(process.argv.slice(2), process.env);
  const stderr: string[] = [];
  const exits: number[] = [];
  const stdout = t.mock.method(process.stdout, 'write');
  await launch(config, TEST_OPTIONS, {
    browserStrategy: recordingLogins().browserStrategy,
    stderr: (line) => stderr.push(line),
    exit: (code) => exits.push(code),
    processLike: Object.assign(new EventEmitter(), {
      stdin: new EventEmitter(),
    }),
    platform: 'linux',
  });

  assert.deepStrictEqual(exits, [1]);
  assert.equal(stdioStart.mock.callCount(), 0);
  assert.deepStrictEqual(stderr, [
    `[MCP] Destination "default" uses jwt / none, which this server does not support\n${JWT_NONE_HINT}`,
  ]);
  assert.equal(
    JWT_NONE_HINT,
    'a token you hold is sent in the x-sap-jwt-token header to mcp-abap-adt-http or mcp-abap-adt-sse; for stdio, create the session with mcp-auth',
  );

  // The check's read of the destination was refused, as destination_refused,
  // before any provider was asked for.
  assert.equal(settingsFor.mock.callCount(), 1);
  assert.equal(getProvider.mock.callCount(), 0);
  let thrown: unknown;
  await settingsFor.mock.calls[0]?.result?.catch((error: unknown) => {
    thrown = error;
  });
  const read = destinationFailureOf(thrown);
  assert.deepStrictEqual(read, {
    error: 'destination_refused',
    message:
      'Destination "default" uses jwt / none, which this server does not support',
    hint: JWT_NONE_HINT,
  });

  // No broker, no provider, nothing sent; the token in no line.
  assert.equal(constructed.mock.callCount(), 0);
  assert.deepStrictEqual(standIn.requests, []);
  assert.equal(stdout.mock.callCount(), 0);
  for (const line of [...stderr, JSON.stringify(read)]) {
    assert.ok(!line.includes('held-token'));
    assert.ok(!line.includes('PLACEHOLDER'));
  }
});
