/**
 * The launcher's destination: what the parameters build (one factory, one
 * destination, the browser reaching the login strategy), what stops a start
 * before any transport, and the startup summary's presence-only secrets.
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import { assertRejects } from '../../../../src/__tests__/helpers/assertions';
import {
  authBroker as authBrokerModule,
  authProviderBrowsers as browsers,
} from '../../../../src/__tests__/helpers/packageFiles';

// The shipped browsers are stand-ins tagged with what they were built for:
// the launcher's mapping is observed, and nothing is ever launched. They are
// replaced on the module that defines them (the package index re-exports
// them by getter) before the launcher's browser table loads, which takes
// them when it loads; the table keeps them after any restore.
const tagged = (factory: string) => (argument?: string) => ({
  open: async () => {},
  built: argument === undefined ? factory : `${factory}(${argument})`,
});
mock.property(browsers, 'linuxDefaultBrowser', tagged('linuxDefaultBrowser'));
mock.property(browsers, 'linuxBrowser', tagged('linuxBrowser'));

import { browserCallbackStrategy } from '@mcp-abap-adt/auth-providers';
import type {
  AuthorizationRequest,
  IAuthorizationStrategy,
} from '@mcp-abap-adt/interfaces-auth';
import { readConfigFile } from '@mcp-abap-adt/lib/config';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { AuthBrokerFactory, type LoginStrategyOptions } from '../auth';
import { CORE_PARAMETERS, readCoreConfig } from '../config/coreParameters';
import {
  AUTH_DEBUG_WARNING,
  factoryConfigFrom,
  launch,
  startConnectionTypeRequiredWords,
  startInspectionSystemTypeRequiredWords,
} from '../launcher.js';
import { StdioServer } from '../StdioServer.js';

/** A value the types leave optional, which the case requires: Jest read it untyped. */
function present<T>(value: T | undefined): T {
  assert.ok(value !== undefined);
  return value;
}

/** The launcher's options as `mcp-abap-adt` passes them. */
const TEST_OPTIONS = {
  toolSet: fullToolSet,
  program: 'mcp-abap-adt',
  version: '0.0.0-test',
  packageName: '@mcp-abap-adt/core',
};

/**
 * Every broker the factory builds is counted; nothing else changes:
 * AuthBroker watched on the module that defines it (the index re-exports it
 * by getter, read at call time), the real broker still constructed. Every
 * case restores every mock after it, so it is watched afresh before each.
 */
function watchBrokers() {
  return mock.method(authBrokerModule, 'AuthBroker');
}
let constructed: ReturnType<typeof watchBrokers>;

const SYSTEM_URL = 'https://system.example.test';
const REDIRECT = 'http://localhost:61001/callback';
const PASSWORD = 'placeholder-password-long';

const savedArgv = process.argv;
const savedEnv = { ...process.env };
const savedCwd = process.cwd();

let root: string;
let keysDir: string;
let sessionsDir: string;
/** StdioServer.start replaced: it records the server it was called on. */
function watchStarts() {
  return mock.method(
    StdioServer.prototype,
    'start',
    async function (this: StdioServer) {
      started.push(this);
    },
  );
}
let stdioStart: ReturnType<typeof watchStarts>;
/** The servers the launcher started, in order. */
let started: StdioServer[] = [];

/** The system type the launcher passed the server it started (D26 B4). */
function startedSystemType(): string | undefined {
  const server: unknown = started[0];
  return (server as { systemType?: string } | undefined)?.systemType;
}

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
    'MCP_BROWSER_PROGRAM',
    'MCP_RENEWAL',
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
  // The system kind is required: the stand-in's is stated for every case
  // (a case about the type itself deletes or restates it).
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  constructed = watchBrokers();
  started = [];
  stdioStart = watchStarts();
  // The connection at start is the launcher's own step: not made here.
  mock.method(StdioServer.prototype, 'connectAtStart', async () => ({
    session: 'logged_on',
  }));
});

afterEach(() => {
  mock.restoreAll();
  process.argv = savedArgv;
  process.env = { ...savedEnv };
  process.chdir(savedCwd);
  fs.rmSync(root, { recursive: true, force: true });
});

const silent = { info() {}, warn() {}, error() {}, debug() {} };

function recordingStrategy() {
  const calls: LoginStrategyOptions[] = [];
  const browserStrategy = (
    options: LoginStrategyOptions,
  ): IAuthorizationStrategy<string> => {
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
  platform = 'linux',
) {
  process.argv = ['node', 'mcp-abap-adt', ...argv];
  // As the program reads it: the --conf / --config file, then core's table.
  const args = process.argv.slice(2);
  const file = readConfigFile(CORE_PARAMETERS, args);
  const config = readCoreConfig(
    args,
    process.env,
    file.template ? null : file.yaml,
  );
  const strategy = recordingStrategy();
  const stderr: string[] = [];
  const exits: number[] = [];
  const processLike = Object.assign(new EventEmitter(), {
    stdin: new EventEmitter(),
  });
  const stdout = mock.method(process.stdout, 'write');
  try {
    await launch(config, TEST_OPTIONS, {
      browserStrategy: browserStrategy ?? strategy.browserStrategy,
      stderr: (line) => stderr.push(line),
      exit: (code) => exits.push(code),
      processLike,
      platform,
    });
  } finally {
    // The launcher writes nothing to stdout (H3).
    // The node:test runner reports through this process's stdout in
    // serialized frames (Buffers); a text write is the program's.
    assert.deepStrictEqual(
      stdout.mock.calls.filter((c) => typeof c.arguments[0] === 'string'),
      [],
    );
    stdout.mock.restore();
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
const basicLines = (password = PASSWORD, wire: string | null = 'http') => [
  // An RFC destination states its address and language, and no URL.
  ...(wire === 'rfc'
    ? ['SAP_ASHOST=system.example.test', 'SAP_SYSNR=00', 'SAP_LANGUAGE=EN']
    : [`SAP_URL=${SYSTEM_URL}`]),
  'SAP_CLIENT=100',
  'SAP_AUTH_TYPE=basic',
  // A destination states its wire (#320); `null` leaves it out.
  ...(wire === null ? [] : [`SAP_CONNECTION_TYPE=${wire}`]),
  'SAP_USERNAME=placeholder-user',
  `SAP_PASSWORD=${password}`,
];
/** A file stating rfc beside an HTTP destination's URL: usable only once HTTP wins. */
const rfcStatedBesideUrl = () => [
  ...basicLines(PASSWORD, null),
  'SAP_CONNECTION_TYPE=rfc',
];
const writeSession = (name: string, lines: string[]) =>
  fs.writeFileSync(
    path.join(sessionsDir, `${name}.env`),
    `${lines.join('\n')}\n`,
  );

/** Runs the login the factory's only broker was given; answers what the strategy was built with. */
async function browserOfTheLogin(
  strategy: ReturnType<typeof recordingStrategy>,
) {
  assert.equal(constructed.mock.callCount(), 1);
  const brokerConfig = constructed.mock.calls[0]?.arguments[0];
  const login = present(brokerConfig.authorization)(
    'dest',
    'authorization_code',
  );
  await login.authorize({
    buildAuthorizationUrl: async () => 'https://idp.example.test/authorize',
  });
  // The broker composes a strategy per build of the provider — the startup
  // check's build among them — and each is built with the same options.
  assert.ok(strategy.calls.length >= 1);
  const last = strategy.calls[strategy.calls.length - 1];
  assert.equal(
    strategy.calls.every((c) => c.browser === last.browser),
    true,
  );
  const { browser, ...rest } = last;
  return {
    ...rest,
    ...(browser !== undefined && {
      browser: (browser as unknown as { built: string }).built,
    }),
  };
}

describe('the browser reaches the login strategy, mapped for the platform', () => {
  // A service key states no wire: the destination's connection type is given
  // on the command line (#320).
  const stdio = ['--mcp=dest', '--connection-type=http'];

  it('--browser', async () => {
    writeKey('dest', abapKey);
    const { strategy } = await run([
      ...stdio,
      `--auth-broker-path=${root}`,
      '--browser=firefox',
    ]);
    assert.equal(
      (await browserOfTheLogin(strategy)).browser,
      'linuxBrowser(firefox)',
    );
  });

  it('MCP_BROWSER', async () => {
    writeKey('dest', abapKey);
    process.env.MCP_BROWSER = 'edge';
    const { strategy } = await run([...stdio, `--auth-broker-path=${root}`]);
    assert.equal(
      (await browserOfTheLogin(strategy)).browser,
      'linuxBrowser(microsoft-edge)',
    );
  });

  it('YAML browser', async () => {
    writeKey('dest', abapKey);
    const yamlFile = path.join(root, 'config.yaml');
    fs.writeFileSync(
      yamlFile,
      `browser: chrome\nauth-broker-path: ${JSON.stringify(root)}\n`,
    );
    const { strategy } = await run([...stdio, `--config=${yamlFile}`]);
    assert.equal(
      (await browserOfTheLogin(strategy)).browser,
      'linuxBrowser(google-chrome)',
    );
  });

  it('--browser-program: the named browser with that program', async () => {
    writeKey('dest', abapKey);
    const { strategy } = await run([
      ...stdio,
      `--auth-broker-path=${root}`,
      '--browser-program=my-browser',
    ]);
    assert.equal(
      (await browserOfTheLogin(strategy)).browser,
      'linuxBrowser(my-browser)',
    );
  });

  it('--browser-program on a platform with no browser: the linux launch of that program', async () => {
    writeKey('dest', abapKey);
    const { strategy, exits } = await run(
      [...stdio, `--auth-broker-path=${root}`, '--browser-program=my-browser'],
      undefined,
      'freebsd',
    );
    assert.deepStrictEqual(exits, []);
    assert.equal(
      (await browserOfTheLogin(strategy)).browser,
      'linuxBrowser(my-browser)',
    );
  });

  it('none given: the system browser, and no port — the strategy keeps its own 61001', async () => {
    writeKey('dest', abapKey);
    const { strategy } = await run([...stdio, `--auth-broker-path=${root}`]);
    assert.deepStrictEqual(await browserOfTheLogin(strategy), {
      browser: 'linuxDefaultBrowser',
    });
  });

  it('--browser=none: no browser; --browser-auth-port reaches the strategy', async () => {
    writeKey('dest', abapKey);
    const { strategy } = await run([
      ...stdio,
      `--auth-broker-path=${root}`,
      '--browser=none',
      '--browser-auth-port=61005',
    ]);
    assert.deepStrictEqual(await browserOfTheLogin(strategy), { port: 61005 });
  });
});

describe('a browser that cannot be served stops the start', () => {
  for (const [args, words] of [
    [['--browser=opera'], '--browser=none'],
    [
      ['--browser=firefox', '--browser-program=x'],
      '--browser-program excludes --browser',
    ],
  ] satisfies [string[], string][]) {
    it(
      format('%j: its words on stderr, exit 1, nothing read', args),
      async () => {
        writeKey('dest', abapKey);
        const { stderr, exits } = await run([
          '--mcp=dest',
          `--auth-broker-path=${root}`,
          ...args,
        ]);
        assert.deepStrictEqual(exits, [1]);
        assert.ok(stderr.join('\n').includes(words));
        assert.equal(constructed.mock.callCount(), 0);
        assert.equal(stdioStart.mock.callCount(), 0);
      },
    );
  }
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

  for (const browser of ['none', 'headless']) {
    it(
      format(
        '--browser=%s: the URL and the callback on stderr, nothing on stdout',
        browser,
      ),
      async (t) => {
        assert.notEqual(process.env.DEBUG_AUTH_LOG, 'true');
        writeKey('dest', abapKey);
        const port = await freePort();
        const { stderr } = await run(
          [
            '--mcp=dest',
            `--auth-broker-path=${root}`,
            // A key states no wire: the start states it (decided first).
            '--connection-type=http',
            `--browser=${browser}`,
            `--browser-auth-port=${port}`,
          ],
          browserCallbackStrategy,
        );
        // auth-providers 6 writes the authorization URL to stderr itself, never
        // through a logger (it carries `state`); the prompt logger carries the
        // rest — the "waiting on" line among it.
        const written: string[] = [];
        const direct = t.mock.method(
          process.stderr,
          'write',
          (chunk: unknown) => {
            written.push(String(chunk));
            return true;
          },
        );
        const stdout = t.mock.method(process.stdout, 'write');
        const broker = present(constructed.mock.calls[0]?.result);
        const login = broker.getToken('dest');
        const failed = assertRejects(login);
        const redirect = `http://localhost:${port}/callback`;
        const said = () => [...written, ...stderr].join('\n');
        for (
          let i = 0;
          i < 100 && !said().includes(encodeURIComponent(redirect));
          i++
        ) {
          await new Promise((r) => setTimeout(r, 20));
        }
        try {
          const text = said();
          assert.ok(
            text.includes(
              'https://uaa.example.test/oauth/authorize?client_id=client-id',
            ),
          );
          assert.ok(
            text.includes(`redirect_uri=${encodeURIComponent(redirect)}`),
          );
          assert.ok(
            stderr.join('\n').includes(`Waiting for callback on ${redirect}`),
          );
          assert.ok(!text.includes('client-secret'));
        } finally {
          // End the login: the identity provider says no — with this attempt's
          // state, so the callback is not ignored.
          const shown = said();
          const from = shown.indexOf(
            'https://uaa.example.test/oauth/authorize?',
          );
          let to = from;
          while (to >= 0 && to < shown.length && shown[to].trim() !== '') to++;
          const state =
            from < 0
              ? ''
              : (new URL(shown.slice(from, to)).searchParams.get('state') ??
                '');
          await fetch(`${redirect}?error=access_denied&state=${state}`).catch(
            () => undefined,
          );
          await failed;
          direct.mock.restore();
          // The node:test runner reports through this process's stdout in
          // serialized frames (Buffers); a text write is the program's.
          assert.deepStrictEqual(
            stdout.mock.calls.filter((c) => typeof c.arguments[0] === 'string'),
            [],
          );
          stdout.mock.restore();
        }
      },
    );
  }
});

describe('one destination per process', () => {
  it('--mcp=X under stdio: one broker, for X; no default beside it', async () => {
    writeSession('dest', basicLines());
    // What a "default" broker would read, were one built: a working-directory
    // .env and a destination named default.
    fs.writeFileSync(path.join(root, '.env'), basicLines().join('\n'));
    writeSession('default', basicLines());
    const { exits } = await run(['--mcp=dest', `--auth-broker-path=${root}`]);
    assert.deepStrictEqual(exits, []);
    assert.equal(constructed.mock.callCount(), 1);
    assert.equal(stdioStart.mock.callCount(), 1);
    assert.ok(
      stdioStart.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, ['dest']),
      ),
    );
  });

  it('an --env-path file → the destination default, one broker', async () => {
    const file = path.join(root, 'conn.env');
    fs.writeFileSync(file, `${basicLines().join('\n')}\n`);
    const { exits, stderr } = await run([`--env-path=${file}`]);
    assert.deepStrictEqual(exits, []);
    assert.equal(constructed.mock.callCount(), 1);
    assert.ok(
      stdioStart.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, ['default']),
      ),
    );
    assert.ok(stderr.join('\n').includes(`Source:        ${file}`));
  });

  it('the runtime session files live beside the sessions: <auth-broker-path>/runtime', async () => {
    writeSession('dest', basicLines());
    const { exits } = await run(['--mcp=dest', `--auth-broker-path=${root}`]);
    assert.deepStrictEqual(exits, []);
    const server = stdioStart.mock.calls[0]?.this as unknown as {
      leftoverSessions?: { directory: string };
    };
    assert.equal(
      server.leftoverSessions?.directory,
      path.join(root, 'runtime'),
    );
  });

  it('neither: inspection-only, no broker', async () => {
    const { stderr } = await run([]);
    assert.equal(constructed.mock.callCount(), 0);
    assert.ok(
      stdioStart.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, [undefined]),
      ),
    );
    assert.ok(stderr[0].includes('inspection-only mode'));
  });

  // Inspection lists the declared variant's tool set (its ADT type table):
  // without a system type there is none to list, and none is picked.
  it('neither, and no system type stated: refused naming --system-type, exit 1, no transport', async () => {
    delete process.env.SAP_SYSTEM_TYPE;
    const { stderr, exits } = await run([]);
    assert.deepStrictEqual(exits, [1]);
    assert.equal(stdioStart.mock.callCount(), 0);
    assert.equal(constructed.mock.callCount(), 0);
    assert.ok(
      stderr.includes(`[MCP] ${startInspectionSystemTypeRequiredWords()}`),
    );
    assert.ok(
      startInspectionSystemTypeRequiredWords().includes('--system-type'),
    );
  });

  it('neither, with --system-type=cloud: inspection-only, the cloud tool set', async () => {
    delete process.env.SAP_SYSTEM_TYPE;
    const { exits } = await run(['--system-type=cloud']);
    assert.deepStrictEqual(exits, []);
    assert.ok(
      stdioStart.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, [undefined]),
      ),
    );
    // Passed to the server; the process environment is not written.
    assert.equal(startedSystemType(), 'cloud');
    assert.equal(process.env.SAP_SYSTEM_TYPE, undefined);
  });
});

describe('a destination that cannot be served stops the start', () => {
  it('its words on stderr, exit 1, no transport started', async () => {
    // Malformed: no system URL.
    writeSession('dest', [
      'SAP_AUTH_TYPE=basic',
      'SAP_CONNECTION_TYPE=http',
      'SAP_USERNAME=placeholder-user',
      `SAP_PASSWORD=${PASSWORD}`,
    ]);
    const { stderr, exits } = await run([
      '--mcp=dest',
      `--auth-broker-path=${root}`,
    ]);
    assert.deepStrictEqual(exits, [1]);
    assert.ok(
      stderr.join('\n').includes('Destination "dest" cannot be used: SAP_URL'),
    );
    assert.ok(!stderr.join('\n').includes(PASSWORD));
    assert.equal(stdioStart.mock.callCount(), 0);
  });

  it('a key that does not parse: its class, never a slice of the file (H4)', async () => {
    fs.writeFileSync(
      path.join(keysDir, 'dest.json'),
      '{"uaa":{"clientsecret":PLACEHOLDERSECRET}}',
    );
    const { stderr, exits } = await run([
      '--mcp=dest',
      `--auth-broker-path=${root}`,
      '--connection-type=http',
    ]);
    assert.deepStrictEqual(exits, [1]);
    const said = stderr.join('\n');
    assert.match(
      said,
      /^\[MCP\] Destination "dest" cannot be read: [A-Za-z]*Error$/,
    );
    for (let i = 0; i + 4 <= 'PLACEHOLDERSECRET'.length; i++) {
      assert.ok(!said.includes('PLACEHOLDERSECRET'.slice(i, i + 4)));
    }
    assert.ok(!said.includes('clientsecret'));
    assert.equal(stdioStart.mock.callCount(), 0);
  });

  it('an --env-path file that does not exist: the parameter and the path', async () => {
    const missing = path.join(root, 'nope.env');
    const { stderr, exits } = await run([
      `--env-path=${missing}`,
      '--connection-type=http',
    ]);
    assert.deepStrictEqual(exits, [1]);
    assert.deepStrictEqual(stderr, [
      `[MCP] --env-path: the file does not exist: ${missing}`,
    ]);
    assert.equal(stdioStart.mock.callCount(), 0);
  });

  it('--mcp that is a path: refused naming --mcp, nothing read', async () => {
    const { stderr, exits } = await run([
      '--mcp=../outside',
      `--auth-broker-path=${root}`,
    ]);
    assert.deepStrictEqual(exits, [1]);
    assert.ok(stderr.join('\n').includes('--mcp'));
    assert.equal(constructed.mock.callCount(), 0);
    assert.equal(stdioStart.mock.callCount(), 0);
  });
});

describe('the startup summary', () => {
  it('a basic destination: the password by its presence only', async () => {
    writeSession('dest', basicLines());
    const { stderr } = await run(['--mcp=dest', `--auth-broker-path=${root}`]);
    const summary = stderr.join('\n');
    assert.ok(
      summary.includes(`║  Source:        ${'service-key: dest'.padEnd(45)}║`),
    );
    assert.ok(summary.includes(`║  SAP URL:       ${SYSTEM_URL.padEnd(45)}║`));
    assert.ok(summary.includes(`║  SAP Client:    ${'100'.padEnd(45)}║`));
    assert.ok(summary.includes(`║  Auth Type:     ${'basic'.padEnd(45)}║`));
    assert.ok(
      summary.includes(`║  Username:      ${'placeholder-user'.padEnd(45)}║`),
    );
    assert.ok(summary.includes(`║  Password:      ${'set'.padEnd(45)}║`));
    assert.ok(!summary.includes(PASSWORD));
  });
});

describe('--auth-debug', () => {
  it('prints one start warning line and hands the factory authDebug', async (t) => {
    writeSession('dest', basicLines());
    // The debug lines go through console.error: stderr in the program.
    const lines = t.mock.method(console, 'error', () => {});
    const { stderr } = await run([
      '--mcp=dest',
      `--auth-broker-path=${root}`,
      '--auth-debug',
    ]);
    assert.ok(lines.mock.callCount() > 0);
    lines.mock.restore();
    assert.deepStrictEqual(
      stderr.filter((line) => line.includes('--auth-debug')),
      [AUTH_DEBUG_WARNING],
    );
    assert.equal(
      factoryConfigFrom(readCoreConfig(['--auth-debug'], {}), {
        browserStrategy: () => {
          throw new Error('not built');
        },
        promptLogger: { info() {}, warn() {}, error() {}, debug() {} },
      }).authDebug,
      true,
    );
  });

  it('says nothing without it', async () => {
    writeSession('dest', basicLines());
    const { stderr } = await run(['--mcp=dest', `--auth-broker-path=${root}`]);
    assert.ok(!stderr.join('\n').includes('--auth-debug'));
  });
});

describe('the shutdown is installed', () => {
  it('stdio: SIGTERM settles and exits 0', async () => {
    writeSession('dest', basicLines());
    const { processLike, exits } = await run([
      '--mcp=dest',
      `--auth-broker-path=${root}`,
    ]);
    assert.equal(processLike.listenerCount('SIGTERM'), 1);
    assert.equal(processLike.listenerCount('SIGINT'), 1);
    assert.equal(processLike.stdin.listenerCount('end'), 1);
    processLike.emit('SIGTERM');
    await new Promise((r) => setTimeout(r, 20));
    assert.deepStrictEqual(exits, [0]);
  });
});

describe('factoryConfigFrom: the env file', () => {
  const browserStrategy = recordingStrategy().browserStrategy;

  it("envFilePath, CoreConfig's alias, is read too, naming the field", () => {
    assert.deepStrictEqual(
      factoryConfigFrom(
        { envFilePath: '/x/conn.env' },
        { browserStrategy, promptLogger: silent },
      ).envFile,
      { path: '/x/conn.env', source: 'CoreConfig.envFilePath' },
    );
  });

  it('envFile by hand: named by its field', () => {
    assert.deepStrictEqual(
      factoryConfigFrom(
        { envFile: '/x/conn.env' },
        { browserStrategy, promptLogger: silent },
      ).envFile,
      { path: '/x/conn.env', source: 'CoreConfig.envFile' },
    );
  });

  it('the source the parser stated wins', () => {
    assert.deepStrictEqual(
      factoryConfigFrom(
        {
          envFile: '/x/conn.env',
          envFilePath: '/x/conn.env',
          envFileSource: 'MCP_ENV_PATH',
        },
        { browserStrategy, promptLogger: silent },
      ).envFile,
      { path: '/x/conn.env', source: 'MCP_ENV_PATH' },
    );
  });

  it('a config with envFilePath alone serves the destination default', async () => {
    const file = path.join(root, 'conn.env');
    fs.writeFileSync(file, `${basicLines().join('\n')}\n`);
    const exits: number[] = [];
    await launch({ envFilePath: file }, TEST_OPTIONS, {
      browserStrategy,
      stderr: () => {},
      exit: (code) => exits.push(code),
      processLike: Object.assign(new EventEmitter(), {
        stdin: new EventEmitter(),
      }),
    });
    assert.deepStrictEqual(exits, []);
    assert.ok(
      stdioStart.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, ['default']),
      ),
    );
  });
});

/**
 * The connection type a destination's .env states, as in 15.x: the file's
 * SAP_CONNECTION_TYPE is read below the process environment (never copied
 * into it), and the precedence is CLI, then that environment, then YAML.
 */
describe('SAP_CONNECTION_TYPE inside the env file', () => {
  async function settingsOf(argv: string[]) {
    const settingsFor = mock.method(AuthBrokerFactory.prototype, 'settingsFor');
    const result = await run(argv);
    assert.deepStrictEqual(result.exits, []);
    assert.ok(settingsFor.mock.callCount() > 0);
    return present(await present(settingsFor.mock.calls[0]?.result));
  }
  const envFile = (lines: string[]) => {
    const file = path.join(root, 'conn.env');
    fs.writeFileSync(file, `${lines.join('\n')}\n`);
    return file;
  };

  it('basic + rfc in the file: rfc', async () => {
    const file = envFile(basicLines(PASSWORD, 'rfc'));
    const settings = await settingsOf([`--env-path=${file}`]);
    assert.equal(settings.connectionType, 'rfc');
  });

  it('snc + rfc in the file: not refused, rfc', async () => {
    const file = envFile([
      'SAP_ASHOST=system.example.test',
      'SAP_SYSNR=00',
      'SAP_CLIENT=100',
      'SAP_LANGUAGE=EN',
      'SAP_AUTH_TYPE=snc',
      'SAP_SNC_PARTNERNAME=p:placeholder',
      'SAP_CONNECTION_TYPE=rfc',
    ]);
    const settings = await settingsOf([`--env-path=${file}`]);
    assert.equal(settings.authType, 'snc');
    assert.equal(settings.connectionType, 'rfc');
  });

  it('--connection-type=http beats the file', async () => {
    const file = envFile(rfcStatedBesideUrl());
    const settings = await settingsOf([
      `--env-path=${file}`,
      '--connection-type=http',
    ]);
    assert.equal(settings.connectionType, 'http');
  });

  it('the file beats YAML connection-type', async () => {
    const file = envFile(basicLines(PASSWORD, 'rfc'));
    const yamlFile = path.join(root, 'config.yaml');
    fs.writeFileSync(yamlFile, 'connection-type: http\n');
    const settings = await settingsOf([
      `--env-path=${file}`,
      `--config=${yamlFile}`,
    ]);
    assert.equal(settings.connectionType, 'rfc');
  });

  it('the process environment beats the file', async () => {
    const file = envFile(rfcStatedBesideUrl());
    process.env.SAP_CONNECTION_TYPE = 'http';
    const settings = await settingsOf([`--env-path=${file}`]);
    assert.equal(settings.connectionType, 'http');
  });

  it("--mcp=<name>: the destination's own <sessions>/<name>.env states it", async () => {
    writeSession('dest', basicLines(PASSWORD, 'rfc'));
    const settings = await settingsOf([
      '--mcp=dest',
      `--auth-broker-path=${root}`,
    ]);
    assert.equal(settings.connectionType, 'rfc');
  });

  it('--mcp=<name> whose file states no connection type: refused, nothing started', async () => {
    writeSession('dest', basicLines(PASSWORD, null));
    const { exits, stderr } = await run([
      '--mcp=dest',
      `--auth-broker-path=${root}`,
    ]);
    assert.deepStrictEqual(exits, [1]);
    assert.ok(
      stderr.join('\n').includes(startConnectionTypeRequiredWords('dest')),
    );
    assert.equal(stdioStart.mock.callCount(), 0);
  });

  it('no connection type anywhere: refused naming the three places, nothing started', async () => {
    const file = envFile(basicLines(PASSWORD, null));
    const { exits, stderr } = await run([`--env-path=${file}`]);
    assert.deepStrictEqual(exits, [1]);
    assert.ok(
      stderr.join('\n').includes(startConnectionTypeRequiredWords('default')),
    );
    assert.equal(stdioStart.mock.callCount(), 0);
  });

  it('a word that is not a connection type: refused naming the key, not quoting it', async () => {
    const file = envFile(basicLines(PASSWORD, 'carrier-pigeon'));
    const { exits, stderr } = await run([`--env-path=${file}`]);
    assert.deepStrictEqual(exits, [1]);
    assert.ok(stderr.join('\n').includes('SAP_CONNECTION_TYPE'));
    assert.ok(!stderr.join('\n').includes('carrier-pigeon'));
    assert.equal(stdioStart.mock.callCount(), 0);
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
    const { exits } = await run([]);
    assert.deepStrictEqual(exits, []);
    assert.equal(constructed.mock.callCount(), 0);
    assert.ok(
      stdioStart.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, [undefined]),
      ),
    );
  });

  it('named with --env-path=./.env, it is the destination default', async () => {
    fs.writeFileSync(path.join(root, '.env'), `${basicLines().join('\n')}\n`);
    await run(['--env-path=./.env']);
    assert.ok(
      stdioStart.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, ['default']),
      ),
    );
  });
});

/**
 * The system type, as the connection type: CLI, then the process environment
 * — which the env file's SAP_SYSTEM_TYPE joins, never over a value set
 * before — then YAML. The connector reads SAP_SYSTEM_TYPE from the process
 * environment, so that is where the outcome is checked.
 */
describe('SAP_SYSTEM_TYPE inside the env file', () => {
  // These cases are about where the type comes from: none is preset.
  beforeEach(() => {
    delete process.env.SAP_SYSTEM_TYPE;
  });
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
    const before = { ...process.env };
    const result = await run([...argv]);
    assert.deepStrictEqual(result.exits, []);
    // Passed to the server; the process environment is unchanged.
    assert.deepStrictEqual({ ...process.env }, before);
    return startedSystemType();
  }

  it('the file beats YAML system-type', async () => {
    const file = envFile([...basicLines(), 'SAP_SYSTEM_TYPE=onprem']);
    assert.equal(
      await systemTypeOf([
        `--env-path=${file}`,
        `--config=${yamlWith('system-type: cloud\n')}`,
      ]),
      'onprem',
    );
  });

  it('--system-type=cloud beats the file', async () => {
    const file = envFile([...basicLines(), 'SAP_SYSTEM_TYPE=onprem']);
    assert.equal(
      await systemTypeOf([`--env-path=${file}`, '--system-type=cloud']),
      'cloud',
    );
  });

  it('the process environment beats the file', async () => {
    const file = envFile([...basicLines(), 'SAP_SYSTEM_TYPE=onprem']);
    process.env.SAP_SYSTEM_TYPE = 'legacy';
    assert.equal(await systemTypeOf([`--env-path=${file}`]), 'legacy');
  });

  it('YAML alone: the YAML value', async () => {
    const file = envFile(basicLines());
    assert.equal(
      await systemTypeOf([
        `--env-path=${file}`,
        `--config=${yamlWith('system-type: cloud\n')}`,
      ]),
      'cloud',
    );
  });

  it('a word that is not a system type: refused naming the key, not quoting it', async () => {
    const file = envFile([...basicLines(), 'SAP_SYSTEM_TYPE=mainframe']);
    const { exits, stderr } = await run([`--env-path=${file}`]);
    assert.deepStrictEqual(exits, [1]);
    assert.deepStrictEqual(stderr, [
      '[MCP] SAP_SYSTEM_TYPE (environment or env file) must be onprem, cloud or legacy',
    ]);
    assert.equal(stdioStart.mock.callCount(), 0);
  });
});
