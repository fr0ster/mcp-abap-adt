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

import { EventEmitter } from 'node:events';

// Every broker the factory builds is counted; nothing else changes.
jest.mock('@mcp-abap-adt/auth-broker', () => {
  const actual = jest.requireActual('@mcp-abap-adt/auth-broker');
  return {
    ...actual,
    AuthBroker: jest.fn(
      (config: unknown, logger: unknown) =>
        new actual.AuthBroker(config, logger),
    ),
  };
});

import { AuthBroker } from '@mcp-abap-adt/auth-broker';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import {
  type AdtStandIn,
  adtStandIn,
} from '../../../../src/__tests__/helpers/adtStandIn';
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
};

const TOKEN = 'held-token-PLACEHOLDER.payload.signature';
const constructed = AuthBroker as unknown as jest.Mock;

const savedArgv = process.argv;
const savedEnv = { ...process.env };
const savedCwd = process.cwd();

let base: BrokerBase;
let standIn: AdtStandIn;
let stdioStart: jest.SpyInstance;
let settingsFor: jest.SpyInstance;
let getProvider: jest.SpyInstance;

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
  constructed.mockClear();
  stdioStart = jest
    .spyOn(StdioServer.prototype, 'start')
    .mockResolvedValue(undefined);
  // The connection at start is the launcher's own step: not made here.
  jest
    .spyOn(StdioServer.prototype, 'connectAtStart')
    .mockResolvedValue({ session: 'logged_on' });
  settingsFor = jest.spyOn(AuthBrokerFactory.prototype, 'settingsFor');
  getProvider = jest.spyOn(AuthBrokerFactory.prototype, 'getProvider');
});

afterEach(async () => {
  jest.restoreAllMocks();
  process.argv = savedArgv;
  process.env = { ...savedEnv };
  process.chdir(savedCwd);
  base.remove();
  await standIn.close();
});

it('a jwt / none --env file stops the start: destination_refused, its words and where the token goes', async () => {
  const file = base.writeFile('conn.env', [
    `SAP_URL=${standIn.url}`,
    'SAP_CLIENT=100',
    'SAP_AUTH_TYPE=jwt',
    'SAP_GRANT_TYPE=none',
    `SAP_JWT_TOKEN=${TOKEN}`,
    `SAP_ISSUED_FOR=${standIn.url}?sap-client=100`,
    'SAP_ISSUED_BY=placeholder-issuer-record',
  ]);
  process.argv = ['node', 'mcp-abap-adt', `--env-path=${file}`];
  const config = readCoreConfig(process.argv.slice(2), process.env);
  const stderr: string[] = [];
  const exits: number[] = [];
  const stdout = jest.spyOn(process.stdout, 'write');
  await launch(config, TEST_OPTIONS, {
    browserStrategy: recordingLogins().browserStrategy,
    stderr: (line) => stderr.push(line),
    exit: (code) => exits.push(code),
    processLike: Object.assign(new EventEmitter(), {
      stdin: new EventEmitter(),
    }),
    platform: 'linux',
  });

  expect(exits).toEqual([1]);
  expect(stdioStart).not.toHaveBeenCalled();
  expect(stderr).toEqual([
    `[MCP] Destination "default" uses jwt / none, which this server does not support\n${JWT_NONE_HINT}`,
  ]);
  expect(JWT_NONE_HINT).toBe(
    'a token you hold is sent in the x-sap-jwt-token header to mcp-abap-adt-http or mcp-abap-adt-sse; for stdio, create the session with mcp-auth',
  );

  // The check's read of the destination was refused, as destination_refused,
  // before any provider was asked for.
  expect(settingsFor).toHaveBeenCalledTimes(1);
  expect(getProvider).not.toHaveBeenCalled();
  let thrown: unknown;
  await (settingsFor.mock.results[0].value as Promise<unknown>).catch(
    (error: unknown) => {
      thrown = error;
    },
  );
  const read = destinationFailureOf(thrown);
  expect(read).toEqual({
    error: 'destination_refused',
    message:
      'Destination "default" uses jwt / none, which this server does not support',
    hint: JWT_NONE_HINT,
  });

  // No broker, no provider, nothing sent; the token in no line.
  expect(constructed).not.toHaveBeenCalled();
  expect(standIn.requests).toEqual([]);
  expect(stdout).not.toHaveBeenCalled();
  for (const line of [...stderr, JSON.stringify(read)]) {
    expect(line).not.toContain('held-token');
    expect(line).not.toContain('PLACEHOLDER');
  }
});
