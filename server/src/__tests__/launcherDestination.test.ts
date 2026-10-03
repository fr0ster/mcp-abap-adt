/**
 * The launcher's destination: what the parameters build (one factory, one
 * destination, the browser reaching the login strategy), what stops a start
 * before any transport, and the startup summary's mask, unchanged.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
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
import {
  AuthBrokerFactory,
  browserCallbackStrategy,
} from '@mcp-abap-adt/lib/auth';
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
  // Real path: on macOS the temp dir is under /var, a link to /private/var.
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-destination-')),
  );
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
async function run(
  argv: string[],
  browserStrategy?: ReturnType<typeof recordingStrategy>['browserStrategy'],
) {
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
        browserStrategy: browserStrategy ?? strategy.browserStrategy,
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

/**
 * A login with no browser to open: the URL to open is the only way in, so it
 * reaches stderr whatever DEBUG_AUTH_LOG says — and never stdout (H3). Run
 * through the real strategy and the real provider, whose logger is the
 * broker's: silent without DEBUG_AUTH_LOG.
 */
describe('the manual-login prompt reaches stderr without DEBUG_AUTH_LOG', () => {
  const freePort = () =>
    new Promise<number>((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address() as net.AddressInfo;
        probe.close(() => resolve(port));
      });
    });

  it.each(['none', 'headless'])(
    '--browser=%s: the URL and the callback on stderr, nothing on stdout',
    async (browser) => {
      expect(process.env.DEBUG_AUTH_LOG).not.toBe('true');
      writeKey('dest', abapKey);
      const port = await freePort();
      const { stderr } = await run(
        [
          '--transport=stdio',
          '--mcp=dest',
          `--auth-broker-path=${root}`,
          `--browser=${browser}`,
          `--browser-auth-port=${port}`,
        ],
        browserCallbackStrategy,
      );
      const stdout = jest.spyOn(process.stdout, 'write');
      const broker = constructed.mock.results[0].value;
      const login = broker.getToken('dest');
      const failed = expect(login).rejects.toThrow();
      const redirect = `http://localhost:${port}/callback`;
      const url =
        'https://uaa.example.test/oauth/authorize?client_id=client-id' +
        `&redirect_uri=${encodeURIComponent(redirect)}&response_type=code`;
      for (let i = 0; i < 100 && !stderr.join('\n').includes(url); i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      try {
        const said = stderr.join('\n');
        expect(said).toContain('Open this URL in your browser to authenticate');
        expect(said).toContain(url);
        expect(said).toContain(`Waiting for callback on ${redirect}`);
        expect(said).not.toContain('client-secret');
      } finally {
        // End the login: the identity provider says no.
        await fetch(`${redirect}?error=access_denied`).catch(() => undefined);
        await failed;
        expect(stdout).not.toHaveBeenCalled();
        stdout.mockRestore();
      }
    },
  );
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

/**
 * The connection type a destination's .env states, as in 15.x: the file's
 * SAP_CONNECTION_TYPE joins the process environment (never over a value
 * already there), and the precedence is CLI, then that environment, then YAML.
 */
describe('SAP_CONNECTION_TYPE inside the env file', () => {
  async function settingsOf(argv: string[]) {
    const settingsFor = jest.spyOn(AuthBrokerFactory.prototype, 'settingsFor');
    const result = await run(argv);
    expect(result.exits).toEqual([]);
    expect(settingsFor).toHaveBeenCalled();
    return settingsFor.mock.results[0].value;
  }
  const envFile = (lines: string[]) => {
    const file = path.join(root, 'conn.env');
    fs.writeFileSync(file, `${lines.join('\n')}\n`);
    return file;
  };

  it('basic + rfc in the file: rfc', async () => {
    const file = envFile([...basicLines(), 'SAP_CONNECTION_TYPE=rfc']);
    const settings = await settingsOf([
      '--transport=stdio',
      `--env-path=${file}`,
    ]);
    expect(settings.connectionType).toBe('rfc');
  });

  it('snc + rfc in the file: not refused, rfc', async () => {
    const file = envFile([
      `SAP_URL=${SYSTEM_URL}`,
      'SAP_AUTH_TYPE=snc',
      'SAP_SNC_PARTNERNAME=p:placeholder',
      'SAP_CONNECTION_TYPE=rfc',
    ]);
    const settings = await settingsOf([
      '--transport=stdio',
      `--env-path=${file}`,
    ]);
    expect(settings.authType).toBe('snc');
    expect(settings.connectionType).toBe('rfc');
  });

  it('--connection-type=http beats the file', async () => {
    const file = envFile([...basicLines(), 'SAP_CONNECTION_TYPE=rfc']);
    const settings = await settingsOf([
      '--transport=stdio',
      `--env-path=${file}`,
      '--connection-type=http',
    ]);
    expect(settings.connectionType).toBe('http');
  });

  it('the file beats YAML connection-type', async () => {
    const file = envFile([...basicLines(), 'SAP_CONNECTION_TYPE=rfc']);
    const yamlFile = path.join(root, 'config.yaml');
    fs.writeFileSync(yamlFile, 'connection-type: http\n');
    const settings = await settingsOf([
      '--transport=stdio',
      `--env-path=${file}`,
      `--config=${yamlFile}`,
    ]);
    expect(settings.connectionType).toBe('rfc');
  });

  it('the process environment beats the file', async () => {
    const file = envFile([...basicLines(), 'SAP_CONNECTION_TYPE=rfc']);
    process.env.SAP_CONNECTION_TYPE = 'http';
    const settings = await settingsOf([
      '--transport=stdio',
      `--env-path=${file}`,
    ]);
    expect(settings.connectionType).toBe('http');
  });

  it('a word that is not a connection type: refused naming the key, not quoting it', async () => {
    const file = envFile([
      ...basicLines(),
      'SAP_CONNECTION_TYPE=carrier-pigeon',
    ]);
    const { exits, stderr } = await run([
      '--transport=stdio',
      `--env-path=${file}`,
    ]);
    expect(exits).toEqual([1]);
    expect(stderr.join('\n')).toContain('SAP_CONNECTION_TYPE');
    expect(stderr.join('\n')).not.toContain('carrier-pigeon');
    expect(stdioStart).not.toHaveBeenCalled();
  });
});

/**
 * Nothing is looked up in the working directory: a server started inside
 * someone else's project must not take their settings. A .env there is read
 * only when named.
 */
describe('the working directory .env is never the destination', () => {
  it('with no --env / --env-path / --mcp: no destination, inspection-only under stdio', async () => {
    fs.writeFileSync(path.join(root, '.env'), `${basicLines().join('\n')}\n`);
    const { exits } = await run(['--transport=stdio']);
    expect(exits).toEqual([]);
    expect(constructed).not.toHaveBeenCalled();
    expect(stdioStart).toHaveBeenCalledWith('mock');
  });

  it('named with --env-path=./.env, it is the destination default', async () => {
    fs.writeFileSync(path.join(root, '.env'), `${basicLines().join('\n')}\n`);
    await run(['--transport=stdio', '--env-path=./.env']);
    expect(stdioStart).toHaveBeenCalledWith('default');
  });
});

/**
 * The system type, as the connection type: CLI, then the process environment
 * — which the env file's SAP_SYSTEM_TYPE joins, never over a value set
 * before — then YAML. The connector reads SAP_SYSTEM_TYPE from the process
 * environment, so that is where the outcome is checked.
 */
describe('SAP_SYSTEM_TYPE inside the env file', () => {
  const envFile = (lines: string[]) => {
    const file = path.join(root, 'conn.env');
    fs.writeFileSync(file, `${lines.join('\n')}\n`);
    return file;
  };
  const yamlWith = (text: string) => {
    const file = path.join(root, 'config.yaml');
    fs.writeFileSync(file, text);
    return file;
  };
  async function systemTypeOf(argv: string[]) {
    const result = await run(['--transport=stdio', ...argv]);
    expect(result.exits).toEqual([]);
    return process.env.SAP_SYSTEM_TYPE;
  }

  it('the file beats YAML system-type', async () => {
    const file = envFile([...basicLines(), 'SAP_SYSTEM_TYPE=onprem']);
    expect(
      await systemTypeOf([
        `--env-path=${file}`,
        `--config=${yamlWith('system-type: cloud\n')}`,
      ]),
    ).toBe('onprem');
  });

  it('--system-type=cloud beats the file', async () => {
    const file = envFile([...basicLines(), 'SAP_SYSTEM_TYPE=onprem']);
    expect(
      await systemTypeOf([`--env-path=${file}`, '--system-type=cloud']),
    ).toBe('cloud');
  });

  it('the process environment beats the file', async () => {
    const file = envFile([...basicLines(), 'SAP_SYSTEM_TYPE=onprem']);
    process.env.SAP_SYSTEM_TYPE = 'legacy';
    expect(await systemTypeOf([`--env-path=${file}`])).toBe('legacy');
  });

  it('YAML alone: the YAML value', async () => {
    const file = envFile(basicLines());
    expect(
      await systemTypeOf([
        `--env-path=${file}`,
        `--config=${yamlWith('system-type: cloud\n')}`,
      ]),
    ).toBe('cloud');
  });

  it('a word that is not a system type: refused naming the key, not quoting it', async () => {
    const file = envFile([...basicLines(), 'SAP_SYSTEM_TYPE=mainframe']);
    const { exits, stderr } = await run([
      '--transport=stdio',
      `--env-path=${file}`,
    ]);
    expect(exits).toEqual([1]);
    expect(stderr).toEqual([
      '[MCP] SAP_SYSTEM_TYPE (environment or env file) must be onprem, cloud or legacy',
    ]);
    expect(stdioStart).not.toHaveBeenCalled();
  });
});
