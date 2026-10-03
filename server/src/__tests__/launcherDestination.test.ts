/**
 * The launcher's destination: what the parameters build (one factory, one
 * destination, the browser reaching the login strategy), what stops a start
 * before any transport, and the startup summary's mask, unchanged.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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

import type {
  AuthorizationRequest,
  IAuthorizationStrategy,
} from '@mcp-abap-adt/interfaces-auth';
import { ServerConfigManager } from '@mcp-abap-adt/lib/config';
import { factoryConfigFrom, launch } from '../launcher.js';
import { SseServer } from '../SseServer.js';
import { StdioServer } from '../StdioServer.js';
import { StreamableHttpServer } from '../StreamableHttpServer.js';

const constructed = (
  jest.requireMock('@mcp-abap-adt/auth-broker') as { AuthBroker: jest.Mock }
).AuthBroker;

const SYSTEM_URL = 'https://system.example.test';
const REDIRECT = 'http://localhost:61001/callback';
const PASSWORD = 'placeholder-password-long';

const savedArgv = process.argv;
const savedEnv = { ...process.env };
const savedCwd = process.cwd();

let root: string;
let keysDir: string;
let sessionsDir: string;
let stdioStart: jest.SpyInstance;
let httpStart: jest.SpyInstance;
let sseStart: jest.SpyInstance;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-destination-'));
  keysDir = path.join(root, 'service-keys');
  sessionsDir = path.join(root, 'sessions');
  fs.mkdirSync(keysDir);
  fs.mkdirSync(sessionsDir);
  // No working-directory .env reaches a test by accident.
  process.chdir(root);
  for (const name of [
    'MCP_BROWSER',
    'MCP_BROWSER_AUTH_PORT',
    'MCP_ENV_PATH',
    'MCP_UNSAFE',
    'MCP_USE_AUTH_BROKER',
    'AUTH_BROKER_PATH',
    'SAP_CONNECTION_TYPE',
    'SAP_SYSTEM_TYPE',
    'MCP_TRANSPORT',
  ]) {
    delete process.env[name];
  }
  constructed.mockClear();
  stdioStart = jest
    .spyOn(StdioServer.prototype, 'start')
    .mockResolvedValue(undefined);
  httpStart = jest
    .spyOn(StreamableHttpServer.prototype, 'start')
    .mockResolvedValue(undefined);
  sseStart = jest.spyOn(SseServer.prototype, 'start').mockResolvedValue();
});

afterEach(() => {
  jest.restoreAllMocks();
  process.argv = savedArgv;
  process.env = { ...savedEnv };
  process.chdir(savedCwd);
  fs.rmSync(root, { recursive: true, force: true });
});

function recordingStrategy() {
  const calls: Array<{ browser: string; port?: number }> = [];
  const browserStrategy = (options: {
    browser: string;
    port?: number;
  }): IAuthorizationStrategy<string> => {
    calls.push(options);
    return {
      authorize: async (request: AuthorizationRequest) => {
        await request.buildAuthorizationUrl(REDIRECT);
        return { payload: 'code-1', redirectUri: REDIRECT };
      },
    };
  };
  return { browserStrategy, calls };
}

/** Parses `argv` as the program does, then launches with stand-in edges. */
async function run(argv: string[]) {
  process.argv = ['node', 'mcp-abap-adt', ...argv];
  const config = await new ServerConfigManager().getConfig();
  const strategy = recordingStrategy();
  const stderr: string[] = [];
  const exits: number[] = [];
  const processLike = Object.assign(new EventEmitter(), {
    stdin: new EventEmitter(),
  });
  const stdout = jest.spyOn(process.stdout, 'write');
  try {
    await launch(
      config,
      { exposition: ['readonly'], includeSearch: false },
      {
        browserStrategy: strategy.browserStrategy,
        stderr: (line) => stderr.push(line),
        exit: (code) => exits.push(code),
        processLike,
      },
    );
  } finally {
    // The launcher writes nothing to stdout (H3).
    expect(stdout).not.toHaveBeenCalled();
    stdout.mockRestore();
  }
  return { strategy, stderr, exits, processLike };
}

const abapKey = {
  url: SYSTEM_URL,
  abap: { url: SYSTEM_URL, client: '100' },
  uaa: {
    url: 'https://uaa.example.test',
    clientid: 'client-id',
    clientsecret: 'client-secret',
  },
};
const writeKey = (name: string, body: unknown) =>
  fs.writeFileSync(path.join(keysDir, `${name}.json`), JSON.stringify(body));
const basicLines = (password = PASSWORD) => [
  `SAP_URL=${SYSTEM_URL}`,
  'SAP_CLIENT=100',
  'SAP_AUTH_TYPE=basic',
  'SAP_USERNAME=placeholder-user',
  `SAP_PASSWORD=${password}`,
];
const writeSession = (name: string, lines: string[]) =>
  fs.writeFileSync(
    path.join(sessionsDir, `${name}.env`),
    `${lines.join('\n')}\n`,
  );

/** Runs the login the factory's only broker was given; answers the browser the strategy got. */
async function browserOfTheLogin(
  strategy: ReturnType<typeof recordingStrategy>,
) {
  expect(constructed).toHaveBeenCalledTimes(1);
  const brokerConfig = constructed.mock.calls[0][0];
  const login = brokerConfig.authorization('dest', 'authorization_code');
  await login.authorize({
    buildAuthorizationUrl: async () => 'https://idp.example.test/authorize',
  });
  expect(strategy.calls).toHaveLength(1);
  return strategy.calls[0];
}

describe('the browser reaches the login strategy', () => {
  const stdio = ['--transport=stdio', '--mcp=dest'];

  it('--browser', async () => {
    writeKey('dest', abapKey);
    const { strategy } = await run([
      ...stdio,
      `--auth-broker-path=${root}`,
      '--browser=firefox',
    ]);
    expect((await browserOfTheLogin(strategy)).browser).toBe('firefox');
  });

  it('MCP_BROWSER', async () => {
    writeKey('dest', abapKey);
    process.env.MCP_BROWSER = 'edge';
    const { strategy } = await run([...stdio, `--auth-broker-path=${root}`]);
    expect((await browserOfTheLogin(strategy)).browser).toBe('edge');
  });

  it('YAML browser', async () => {
    writeKey('dest', abapKey);
    const yamlFile = path.join(root, 'config.yaml');
    fs.writeFileSync(
      yamlFile,
      `browser: chrome\nauth-broker-path: ${JSON.stringify(root)}\n`,
    );
    const { strategy } = await run([...stdio, `--config=${yamlFile}`]);
    expect((await browserOfTheLogin(strategy)).browser).toBe('chrome');
  });

  it('none given: system, and no port — the strategy keeps its own 61001', async () => {
    writeKey('dest', abapKey);
    const { strategy } = await run([...stdio, `--auth-broker-path=${root}`]);
    expect(await browserOfTheLogin(strategy)).toEqual({ browser: 'system' });
  });

  it('--browser-auth-port reaches it beside the browser', async () => {
    writeKey('dest', abapKey);
    const { strategy } = await run([
      ...stdio,
      `--auth-broker-path=${root}`,
      '--browser=none',
      '--browser-auth-port=61005',
    ]);
    expect(await browserOfTheLogin(strategy)).toEqual({
      browser: 'none',
      port: 61005,
    });
  });
});

describe('one destination per process', () => {
  it('--mcp=X under stdio: one broker, for X; no default beside it', async () => {
    writeSession('dest', basicLines());
    // What a "default" broker would read, were one built: a working-directory
    // .env and a destination named default.
    fs.writeFileSync(path.join(root, '.env'), basicLines().join('\n'));
    writeSession('default', basicLines());
    const { exits } = await run([
      '--transport=stdio',
      '--mcp=dest',
      `--auth-broker-path=${root}`,
    ]);
    expect(exits).toEqual([]);
    expect(constructed).toHaveBeenCalledTimes(1);
    expect(stdioStart).toHaveBeenCalledTimes(1);
    expect(stdioStart).toHaveBeenCalledWith('dest');
  });

  it('an --env-path file → the destination default, one broker', async () => {
    const file = path.join(root, 'conn.env');
    fs.writeFileSync(file, `${basicLines().join('\n')}\n`);
    const { exits, stderr } = await run([
      '--transport=stdio',
      `--env-path=${file}`,
    ]);
    expect(exits).toEqual([]);
    expect(constructed).toHaveBeenCalledTimes(1);
    expect(stdioStart).toHaveBeenCalledWith('default');
    expect(stderr.join('\n')).toContain(`Source:        ${file}`);
  });

  it('neither: inspection-only, no broker', async () => {
    const { stderr } = await run(['--transport=stdio']);
    expect(constructed).not.toHaveBeenCalled();
    expect(stdioStart).toHaveBeenCalledWith('mock');
    expect(stderr[0]).toContain('inspection-only mode');
  });
});

describe('a destination that cannot be served stops the start', () => {
  it.each([
    ['stdio', () => stdioStart],
    ['http', () => httpStart],
    ['sse', () => sseStart],
  ] as const)(
    '%s: its words on stderr, exit 1, no transport started',
    async (transport, started) => {
      // Malformed: no system URL.
      writeSession('dest', [
        'SAP_AUTH_TYPE=basic',
        'SAP_USERNAME=placeholder-user',
        `SAP_PASSWORD=${PASSWORD}`,
      ]);
      const { stderr, exits } = await run([
        `--transport=${transport}`,
        '--mcp=dest',
        `--auth-broker-path=${root}`,
      ]);
      expect(exits).toEqual([1]);
      expect(stderr.join('\n')).toContain('Destination "dest" lacks: SAP_URL');
      expect(stderr.join('\n')).not.toContain(PASSWORD);
      expect(started()).not.toHaveBeenCalled();
    },
  );

  it('a key that does not parse: its class, never a slice of the file (H4)', async () => {
    fs.writeFileSync(
      path.join(keysDir, 'dest.json'),
      '{"uaa":{"clientsecret":PLACEHOLDERSECRET}}',
    );
    const { stderr, exits } = await run([
      '--transport=stdio',
      '--mcp=dest',
      `--auth-broker-path=${root}`,
    ]);
    expect(exits).toEqual([1]);
    const said = stderr.join('\n');
    expect(said).toMatch(
      /^\[MCP\] Destination "dest" cannot be read: [A-Za-z]*Error$/,
    );
    for (let i = 0; i + 4 <= 'PLACEHOLDERSECRET'.length; i++) {
      expect(said).not.toContain('PLACEHOLDERSECRET'.slice(i, i + 4));
    }
    expect(said).not.toContain('clientsecret');
    expect(stdioStart).not.toHaveBeenCalled();
  });

  it('an --env-path file that does not exist: the parameter and the path', async () => {
    const missing = path.join(root, 'nope.env');
    const { stderr, exits } = await run([
      '--transport=stdio',
      `--env-path=${missing}`,
    ]);
    expect(exits).toEqual([1]);
    expect(stderr).toEqual([
      `[MCP] --env-path: the file does not exist: ${missing}`,
    ]);
    expect(stdioStart).not.toHaveBeenCalled();
  });

  it('--mcp that is a path: refused naming --mcp, nothing read', async () => {
    const { stderr, exits } = await run([
      '--transport=stdio',
      '--mcp=../outside',
      `--auth-broker-path=${root}`,
    ]);
    expect(exits).toEqual([1]);
    expect(stderr.join('\n')).toContain('--mcp');
    expect(constructed).not.toHaveBeenCalled();
    expect(stdioStart).not.toHaveBeenCalled();
  });
});

describe('the startup summary', () => {
  it('a basic destination: the password masked exactly as before', async () => {
    writeSession('dest', basicLines());
    const { stderr } = await run([
      '--transport=stdio',
      '--mcp=dest',
      `--auth-broker-path=${root}`,
    ]);
    const summary = stderr.join('\n');
    expect(summary).toContain(
      `║  Source:        ${'service-key: dest'.padEnd(45)}║`,
    );
    expect(summary).toContain(`║  SAP URL:       ${SYSTEM_URL.padEnd(45)}║`);
    expect(summary).toContain(`║  SAP Client:    ${'100'.padEnd(45)}║`);
    expect(summary).toContain(`║  Auth Type:     ${'basic'.padEnd(45)}║`);
    expect(summary).toContain(
      `║  Username:      ${'placeholder-user'.padEnd(45)}║`,
    );
    // Over 20 characters: the first four and the last four, as before.
    expect(summary).toContain(`║  Password:      ${'plac***long'.padEnd(45)}║`);
    expect(summary).not.toContain(PASSWORD);
  });
});

describe('the shutdown is installed for every transport', () => {
  it.each([
    ['stdio', true],
    ['http', false],
    ['sse', false],
  ] as const)('%s: SIGTERM settles and exits 0', async (transport, stdin) => {
    writeSession('dest', basicLines());
    const { processLike, exits } = await run([
      `--transport=${transport}`,
      '--mcp=dest',
      `--auth-broker-path=${root}`,
    ]);
    expect(processLike.listenerCount('SIGTERM')).toBe(1);
    expect(processLike.listenerCount('SIGINT')).toBe(1);
    expect(processLike.stdin.listenerCount('end')).toBe(stdin ? 1 : 0);
    processLike.emit('SIGTERM');
    await new Promise((r) => setTimeout(r, 20));
    expect(exits).toEqual([0]);
  });
});

describe('factoryConfigFrom: the env file', () => {
  const browserStrategy = recordingStrategy().browserStrategy;

  it("envFilePath, IServerConfig's alias, is read too, naming the field", () => {
    expect(
      factoryConfigFrom({ envFilePath: '/x/conn.env' }, { browserStrategy })
        .envFile,
    ).toEqual({ path: '/x/conn.env', source: 'IServerConfig.envFilePath' });
  });

  it('envFile by hand: named by its field', () => {
    expect(
      factoryConfigFrom({ envFile: '/x/conn.env' }, { browserStrategy })
        .envFile,
    ).toEqual({ path: '/x/conn.env', source: 'IServerConfig.envFile' });
  });

  it('the source the parser stated wins', () => {
    expect(
      factoryConfigFrom(
        {
          envFile: '/x/conn.env',
          envFilePath: '/x/conn.env',
          envFileSource: 'MCP_ENV_PATH',
        },
        { browserStrategy },
      ).envFile,
    ).toEqual({ path: '/x/conn.env', source: 'MCP_ENV_PATH' });
  });

  it('a config with envFilePath alone serves the destination default', async () => {
    const file = path.join(root, 'conn.env');
    fs.writeFileSync(file, `${basicLines().join('\n')}\n`);
    const exits: number[] = [];
    await launch(
      { transport: 'stdio', envFilePath: file },
      { exposition: ['readonly'], includeSearch: false },
      {
        browserStrategy,
        stderr: () => {},
        exit: (code) => exits.push(code),
        processLike: Object.assign(new EventEmitter(), {
          stdin: new EventEmitter(),
        }),
      },
    );
    expect(exits).toEqual([]);
    expect(stdioStart).toHaveBeenCalledWith('default');
  });
});
