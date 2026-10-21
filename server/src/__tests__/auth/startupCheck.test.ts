/**
 * The start reads the destination's settings and builds its provider —
 * `getProvider(destination, { signal: startup })` — so a destination the
 * broker refuses stops the start before any transport; the startup signal is
 * aborted once the check ends, so nothing of the check outlives it. Building
 * sends nothing.
 */

import { EventEmitter } from 'node:events';
import type { BrokerCallOptions } from '@mcp-abap-adt/auth-broker';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { AuthBrokerFactory } from '../../auth/brokerFactory';
import { readCoreConfig } from '../../config/coreParameters';
import { launch } from '../../launcher';
import { StdioServer } from '../../StdioServer';
import {
  authorizationCodeLines,
  type BrokerBase,
  basicLines,
  brokerBase,
  recordingLogins,
  SYSTEM_URL,
} from '../helpers/factoryFixture';

/** The launcher's options as `mcp-abap-adt` passes them. */
const TEST_OPTIONS = {
  toolSet: fullToolSet,
  program: 'mcp-abap-adt',
  version: '0.0.0-test',
};

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
  // The system kind is required: the stand-in's is stated for every case
  // (a case about the type itself deletes or restates it).
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  stdioStart = jest
    .spyOn(StdioServer.prototype, 'start')
    .mockResolvedValue(undefined);
  // The connection at start is the launcher's own step: not made here.
  jest
    .spyOn(StdioServer.prototype, 'connectAtStart')
    .mockResolvedValue({ session: 'logged_on' });
  getProvider = jest.spyOn(AuthBrokerFactory.prototype, 'getProvider');
});

afterEach(() => {
  jest.restoreAllMocks();
  process.argv = savedArgv;
  process.env = { ...savedEnv };
  process.chdir(savedCwd);
  base.remove();
});

async function run(argv: string[], platform = 'linux') {
  process.argv = ['node', 'mcp-abap-adt', ...argv];
  const config = readCoreConfig(process.argv.slice(2), process.env);
  const stderr: string[] = [];
  const exits: number[] = [];
  const processLike = Object.assign(new EventEmitter(), {
    stdin: new EventEmitter(),
  });
  await launch(config, TEST_OPTIONS, {
    browserStrategy: recordingLogins().browserStrategy,
    stderr: (line) => stderr.push(line),
    exit: (code) => exits.push(code),
    processLike,
    platform,
  });
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
    const { stderr, exits } = await run([`--env-path=${file}`]);
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
    const { exits } = await run([`--env-path=${file}`]);
    expect(exits).toEqual([]);
    expect(stdioStart).toHaveBeenCalledTimes(1);
    const signals = startupSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(true);
  });

  describe('a platform with no browser: only a destination that logs in is refused', () => {
    // basic stands for every destination that never logs in (jwt / none is
    // not served over stdio).
    it('basic starts on freebsd with the default --browser', async () => {
      const file = base.writeFile('conn.env', basicLines());
      const { exits, stderr } = await run([`--env-path=${file}`], 'freebsd');
      expect(stderr.join('\n')).not.toContain('browser');
      expect(exits).toEqual([]);
      expect(stdioStart).toHaveBeenCalledTimes(1);
    });

    it('inspection-only starts on freebsd', async () => {
      const { exits } = await run([], 'freebsd');
      expect(exits).toEqual([]);
      expect(stdioStart).toHaveBeenCalledTimes(1);
    });

    it('jwt / authorization_code on freebsd: refused at the startup check, naming browser', async () => {
      const file = base.writeFile('conn.env', authorizationCodeLines());
      const { exits, stderr } = await run([`--env-path=${file}`], 'freebsd');
      expect(exits).toEqual([1]);
      expect(stdioStart).not.toHaveBeenCalled();
      const said = stderr.join('\n');
      expect(said).toContain(
        '[MCP] Destination "default" logs in through a browser, and none is known on this platform (freebsd)\nStart with --browser=none and open the URL the login prints on stderr, or give --browser-program=<program>.',
      );
      // The browser headline replaces the generic one; no second line has it.
      expect(said).not.toContain('cannot be used');
    });

    it('jwt / authorization_code on freebsd with --browser=none: starts', async () => {
      const file = base.writeFile('conn.env', authorizationCodeLines());
      const { exits } = await run(
        [`--env-path=${file}`, '--browser=none'],
        'freebsd',
      );
      expect(exits).toEqual([]);
      expect(stdioStart).toHaveBeenCalledTimes(1);
    });

    it('an unknown --browser name is refused on freebsd too, for a basic destination', async () => {
      const file = base.writeFile('conn.env', basicLines());
      const { exits, stderr } = await run(
        [`--env-path=${file}`, '--browser=opera'],
        'freebsd',
      );
      expect(exits).toEqual([1]);
      expect(stderr.join('\n')).toContain('--browser=none');
      expect(stdioStart).not.toHaveBeenCalled();
    });
  });
});
