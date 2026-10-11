/**
 * D18: the start reads the destination's settings and builds its provider —
 * `getProvider(destination, { signal: startup })` — so a destination the
 * broker refuses stops the start before any transport; the startup signal is
 * aborted once the check ends, so nothing of the check outlives it. Building
 * sends nothing.
 */

import { EventEmitter } from 'node:events';
import type { BrokerCallOptions } from '@mcp-abap-adt/auth-broker';
import { ServerConfigManager } from '@mcp-abap-adt/lib/config';
import { AuthBrokerFactory } from '../../auth/brokerFactory';
import { launch } from '../../launcher';
import { StdioServer } from '../../StdioServer';
import {
  type BrokerBase,
  basicLines,
  brokerBase,
  recordingLogins,
  SYSTEM_URL,
} from '../helpers/factoryFixture';

const savedArgv = process.argv;
const savedEnv = { ...process.env };
const savedCwd = process.cwd();

let base: BrokerBase;
let stdioStart: jest.SpyInstance;
let getProvider: jest.SpyInstance;

beforeEach(() => {
  base = brokerBase('startup-check');
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
  stdioStart = jest
    .spyOn(StdioServer.prototype, 'start')
    .mockResolvedValue(undefined);
  getProvider = jest.spyOn(AuthBrokerFactory.prototype, 'getProvider');
});

afterEach(() => {
  jest.restoreAllMocks();
  process.argv = savedArgv;
  process.env = { ...savedEnv };
  process.chdir(savedCwd);
  base.remove();
});

async function run(argv: string[]) {
  process.argv = ['node', 'mcp-abap-adt', ...argv];
  const config = await new ServerConfigManager().getConfig();
  const stderr: string[] = [];
  const exits: number[] = [];
  const processLike = Object.assign(new EventEmitter(), {
    stdin: new EventEmitter(),
  });
  await launch(
    config,
    { exposition: ['readonly'], includeSearch: false },
    {
      browserStrategy: recordingLogins().browserStrategy,
      stderr: (line) => stderr.push(line),
      exit: (code) => exits.push(code),
      processLike,
      platform: 'linux',
    },
  );
  return { stderr, exits };
}

function startupSignals(): AbortSignal[] {
  return getProvider.mock.calls.map(
    (call) => (call[1] as BrokerCallOptions | undefined)?.signal as AbortSignal,
  );
}

describe('the startup check', () => {
  it('a destination the broker refuses stops the start: no transport', async () => {
    // A URL (the settings read), but no client: the broker's getProvider refuses.
    const file = base.writeFile('conn.env', [
      `SAP_URL=${SYSTEM_URL}`,
      'SAP_AUTH_TYPE=jwt',
      'SAP_GRANT_TYPE=authorization_code',
    ]);
    const { stderr, exits } = await run([
      '--transport=stdio',
      `--env-path=${file}`,
    ]);
    expect(exits).toEqual([1]);
    expect(stdioStart).not.toHaveBeenCalled();
    expect(stderr.join('\n')).toContain('Destination "default"');
    const signals = startupSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0].aborted).toBe(true);
  });

  it('a destination the broker serves starts; the startup signal is aborted once the check ended', async () => {
    const file = base.writeFile('conn.env', basicLines());
    const { exits } = await run(['--transport=stdio', `--env-path=${file}`]);
    expect(exits).toEqual([]);
    expect(stdioStart).toHaveBeenCalledTimes(1);
    const signals = startupSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(true);
  });
});
