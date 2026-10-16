/**
 * `mcp-abap-adt-sse`'s own parameter table: its help lists every SSE option of today under its name and no
 * destination or Streamable HTTP option, every option of another binary and
 * `--transport` stop the start with their words, the shared rows are in it,
 * and its YAML template and validation come from it.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  generateYamlConfigTemplate,
  ParameterRefusal,
  readStartupConfig,
  validateYamlConfig,
} from '@mcp-abap-adt/lib/config';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { load } from 'js-yaml';
import { readSseConfig, SSE_PARAMETERS } from '../../config/sseParameters';
import { main, sseHelp } from '../../launcher';
import { SseServer } from '../../SseServer';

const SSE_SENTENCE =
  '`--transport` is gone: `mcp-abap-adt-sse` serves SSE; for stdio run `mcp-abap-adt`, for Streamable HTTP `mcp-abap-adt-http`';
const HTTP_WORDS =
  'Streamable HTTP is served by `mcp-abap-adt-http` (`@mcp-abap-adt/http`)';
const DESTINATION_WORDS =
  'destinations and logins are served only by `mcp-abap-adt` (stdio); send `x-sap-*` headers';

const savedArgv = process.argv;
const savedEnv = process.env;

/** The environment without anything a developer's shell sets for these binaries. */
function cleanEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(savedEnv)) {
    if (
      key.startsWith('MCP_') ||
      key.startsWith('SAP_') ||
      key === 'AUTH_BROKER_PATH'
    ) {
      continue;
    }
    env[key] = value;
  }
  return { ...env, ...extra };
}

afterEach(() => {
  jest.restoreAllMocks();
  process.argv = savedArgv;
  process.env = savedEnv;
});

/** Runs the program's `main` with `argv`; the start is expected to stop. */
async function start(argv: string[], env: NodeJS.ProcessEnv = {}) {
  process.argv = ['node', 'mcp-abap-adt-sse', ...argv];
  process.env = cleanEnv(env);
  const written: string[] = [];
  const exits: number[] = [];
  jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    written.push(String(chunk));
    return true;
  });
  jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exits.push(code ?? 0);
  }) as never);
  // A start that is not stopped serves nothing here: no socket, no stdin.
  const served = jest
    .spyOn(SseServer.prototype, 'start')
    .mockResolvedValue(undefined);
  await main({
    toolSet: fullToolSet,
    program: 'mcp-abap-adt-sse',
    version: '0.0.0-test',
  });
  return {
    stderr: written.join(''),
    exits,
    served: served.mock.calls.length,
  };
}

/** Every SSE option of today, under its name: CLI, and the env form where it has one. */
const SSE_OPTIONS = [
  '--sse-host',
  'MCP_SSE_HOST',
  '--sse-port',
  'MCP_SSE_PORT',
  '--sse-path',
  '--post-path',
  '--sse-allowed-hosts',
  'MCP_SSE_ALLOWED_HOSTS',
  '--sse-allowed-origins',
  'MCP_SSE_ALLOWED_ORIGINS',
  '--sse-enable-dns-protection',
  'MCP_SSE_ENABLE_DNS_PROTECTION',
];

describe("sse's help", () => {
  const help = sseHelp();

  it.each([
    '--transport',
    '--mcp',
    '--env',
    'MCP_ENV_PATH',
    '--auth-broker-path',
    '--unsafe',
    'MCP_UNSAFE',
    '--browser',
    'MCP_BROWSER',
    '--renewal',
    '--connection-type',
    '--allow-destination-header',
    '--login-timeout',
    '--auth-debug',
    '--host',
    '--port',
    '--path',
    '--http-',
    'MCP_HTTP_',
  ])('lists no %s', (name) => {
    expect(help).not.toContain(name);
  });

  it.each([
    ...SSE_OPTIONS,
    '--tls-cert',
    '--tls-key',
    '--tls-ca',
    'MCP_TLS_CERT',
    '--system-type',
    '--conf',
    '--state-idle-minutes',
    'MCP_STATE_IDLE_MINUTES',
    '--shutdown-timeout',
    'MCP_SHUTDOWN_TIMEOUT',
    'x-sap-debug-terminal-id',
    'x-sap-debug-ide-id',
    'SAP_DEBUG_TERMINAL_ID',
    'SAP_DEBUG_IDE_ID',
  ])('lists %s', (name) => {
    expect(help).toContain(name);
  });
});

describe('every SSE option of today is read under its name', () => {
  it('the CLI forms', () => {
    expect(
      readSseConfig(
        [
          '--sse-host=0.0.0.0',
          '--sse-port=3005',
          '--sse-path=/events',
          '--post-path=/msgs',
          '--sse-allowed-hosts=localhost:3005',
          '--sse-allowed-origins=https://a.com;https://b.com',
          '--sse-enable-dns-protection',
        ],
        {},
      ),
    ).toMatchObject({
      host: '0.0.0.0',
      port: 3005,
      ssePath: '/events',
      postPath: '/msgs',
      allowedHosts: ['localhost:3005'],
      allowedOrigins: ['https://a.com', 'https://b.com'],
      enableDnsRebindingProtection: true,
    });
  });

  it('the env forms', () => {
    expect(
      readSseConfig([], {
        MCP_SSE_HOST: '0.0.0.0',
        MCP_SSE_PORT: '3006',
        MCP_SSE_ALLOWED_HOSTS: 'localhost:3006',
        MCP_SSE_ALLOWED_ORIGINS: 'https://a.com',
        MCP_SSE_ENABLE_DNS_PROTECTION: 'true',
      }),
    ).toMatchObject({
      host: '0.0.0.0',
      port: 3006,
      allowedHosts: ['localhost:3006'],
      allowedOrigins: ['https://a.com'],
      enableDnsRebindingProtection: true,
    });
  });

  it('the YAML forms under sse, and the defaults', () => {
    expect(
      readSseConfig(
        [],
        {},
        {
          sse: {
            port: 3007,
            'allowed-hosts': ['localhost:3007'],
            tls: { cert: '/c', key: '/k' },
          },
        },
      ),
    ).toMatchObject({
      host: '127.0.0.1',
      port: 3007,
      allowedHosts: ['localhost:3007'],
      tls: { cert: '/c', key: '/k' },
    });
    expect(readSseConfig([], {})).toMatchObject({
      host: '127.0.0.1',
      port: 3001,
      enableDnsRebindingProtection: false,
    });
  });
});

describe('--shutdown-timeout is a row of sse', () => {
  it('no default: absent unless given', () => {
    expect(readSseConfig([], {}).shutdownTimeout).toBeUndefined();
  });

  it('CLI, env and YAML reach the config, in seconds', () => {
    expect(readSseConfig(['--shutdown-timeout=5'], {}).shutdownTimeout).toBe(5);
    expect(
      readSseConfig([], { MCP_SHUTDOWN_TIMEOUT: '7' }).shutdownTimeout,
    ).toBe(7);
    expect(
      readSseConfig([], {}, { 'shutdown-timeout': 9 }).shutdownTimeout,
    ).toBe(9);
  });

  it.each(['0', '1.5', 'abc', '86401'])('%s stops the start', async (value) => {
    const { stderr, exits, served } = await start([
      `--shutdown-timeout=${value}`,
    ]);
    expect(stderr).toContain('Invalid --shutdown-timeout');
    expect(exits).toEqual([1]);
    expect(served).toBe(0);
  });
});

describe('--state-idle-minutes is a row of sse', () => {
  it("29 stops the start with main's words", async () => {
    const { stderr, exits, served } = await start(['--state-idle-minutes=29']);
    expect(stderr).toContain(
      'Invalid --state-idle-minutes: "29". Must be a whole number of minutes, at least 30',
    );
    expect(exits).toEqual([1]);
    expect(served).toBe(0);
  });

  it('CLI, env and YAML reach the config; 30 by default', () => {
    expect(readSseConfig([], {}).stateIdleMinutes).toBe(30);
    expect(
      readSseConfig(['--state-idle-minutes=45'], {}).stateIdleMinutes,
    ).toBe(45);
    expect(
      readSseConfig([], { MCP_STATE_IDLE_MINUTES: '40' }).stateIdleMinutes,
    ).toBe(40);
    expect(
      readSseConfig([], {}, { 'state-idle-minutes': 35 }).stateIdleMinutes,
    ).toBe(35);
  });
});

// The binary fixes its tool set: the flag and the YAML key are gone,
// each word answered with the binary of this transport that serves it.
describe('--exposition is gone', () => {
  it('the flag stops the start, naming the binary its words ask for', () => {
    expect(() => readSseConfig(['--exposition=readonly'], {})).toThrow(
      new ParameterRefusal(
        '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the readonly tools alone (with system and search) are served by `mcp-abap-adt-sse-ro` (`@mcp-abap-adt/sse-ro`)',
      ),
    );
    expect(() =>
      readSseConfig(['--exposition', 'readonly,high,debug'], {}),
    ).toThrow(
      new ParameterRefusal(
        '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the high tools are served, beside the readonly ones, by `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`)',
      ),
    );
  });

  it('in the config file too, and the help lists no such option', () => {
    expect(() => readSseConfig([], {}, { exposition: 'readonly' })).toThrow(
      new ParameterRefusal(
        'exposition (config file) is gone (19.0.0): the binary fixes its tool set, so remove it; the readonly tools alone (with system and search) are served by `mcp-abap-adt-sse-ro` (`@mcp-abap-adt/sse-ro`)',
      ),
    );
  });
});

describe('--transport, with any value, stops the start with the sentence of the binary that serves it', () => {
  it.each([
    [['--transport=sse'], {}],
    [['--transport=http'], {}],
    [['--transport=stdio'], {}],
    [['--transport', 'sse'], {}],
    [[], { MCP_TRANSPORT: 'sse' }],
  ] as const)('%j %j', async (argv, env) => {
    const { stderr, exits, served } = await start([...argv], { ...env });
    expect(stderr).toBe(`[MCP] ${SSE_SENTENCE}\n`);
    expect(exits).toEqual([1]);
    expect(served).toBe(0);
  });

  it('in the config file too', () => {
    expect(() => readSseConfig([], {}, { transport: 'sse' })).toThrow(
      SSE_SENTENCE,
    );
  });
});

describe('every removed parameter stops sse with its words', () => {
  it.each([
    ['--mcp=TRIAL', '--mcp', DESTINATION_WORDS],
    ['--env=trial', '--env', DESTINATION_WORDS],
    ['--env-path=./.env', '--env-path', DESTINATION_WORDS],
    ['--auth-broker-path=/x', '--auth-broker-path', DESTINATION_WORDS],
    [
      '--allow-destination-header',
      '--allow-destination-header',
      DESTINATION_WORDS,
    ],
    ['--unsafe', '--unsafe', DESTINATION_WORDS],
    ['--connection-type=rfc', '--connection-type', DESTINATION_WORDS],
    ['--mshost=value-one', '--mshost', DESTINATION_WORDS],
    ['--msserv=value-one', '--msserv', DESTINATION_WORDS],
    ['--sysid=value-one', '--sysid', DESTINATION_WORDS],
    ['--group=value-one', '--group', DESTINATION_WORDS],
    ['--saprouter=value-one', '--saprouter', DESTINATION_WORDS],
    ['--browser=none', '--browser', DESTINATION_WORDS],
    ['--browser-program=/x', '--browser-program', DESTINATION_WORDS],
    ['--browser-auth-port=61001', '--browser-auth-port', DESTINATION_WORDS],
    ['--login-timeout=60', '--login-timeout', DESTINATION_WORDS],
    ['--renewal=refresh-only', '--renewal', DESTINATION_WORDS],
    ['--auth-debug', '--auth-debug', DESTINATION_WORDS],
    ['--host=0.0.0.0', '--host', HTTP_WORDS],
    ['--port=3000', '--port', HTTP_WORDS],
    ['--path=/mcp', '--path', HTTP_WORDS],
    ['--http-host=0.0.0.0', '--http-host', HTTP_WORDS],
    ['--http-port=3000', '--http-port', HTTP_WORDS],
    ['--http-path=/mcp', '--http-path', HTTP_WORDS],
    ['--http-json-response', '--http-json-response', HTTP_WORDS],
    ['--http-allowed-hosts=a:1', '--http-allowed-hosts', HTTP_WORDS],
    ['--http-allowed-origins=http://a', '--http-allowed-origins', HTTP_WORDS],
    [
      '--http-enable-dns-protection',
      '--http-enable-dns-protection',
      HTTP_WORDS,
    ],
  ])('%s', async (arg, form, words) => {
    const { stderr, exits, served } = await start([arg]);
    expect(stderr).toBe(`[MCP] ${form}: ${words}\n`);
    expect(exits).toEqual([1]);
    expect(served).toBe(0);
  });

  it.each([
    [
      'MCP_HTTP_*',
      {
        MCP_HTTP_PORT: '8080',
        MCP_HTTP_HOST: '0.0.0.0',
        MCP_HTTP_ALLOWED_ORIGINS: 'https://a',
        MCP_HTTP_ENABLE_JSON_RESPONSE: 'true',
      },
    ],
    ['MCP_ENV_PATH', { MCP_ENV_PATH: './.env' }],
    ['MCP_UNSAFE', { MCP_UNSAFE: 'true' }],
    [
      'MCP_BROWSER*',
      {
        MCP_BROWSER: 'none',
        MCP_BROWSER_PROGRAM: '/x',
        MCP_BROWSER_AUTH_PORT: '61005',
      },
    ],
    ['MCP_LOGIN_TIMEOUT', { MCP_LOGIN_TIMEOUT: '60' }],
    ['MCP_RENEWAL', { MCP_RENEWAL: 'refresh-only' }],
    ['AUTH_BROKER_PATH', { AUTH_BROKER_PATH: '/x' }],
    ['SAP_CONNECTION_TYPE', { SAP_CONNECTION_TYPE: 'rfc' }],
  ] as const)(
    "another binary's %s is not read: the start proceeds and the value is not used",
    (_family, env) => {
      const lines: string[] = [];
      const exits: number[] = [];
      const config = readStartupConfig(
        SSE_PARAMETERS,
        [],
        { ...env },
        {
          stderr: (line) => lines.push(line),
          exit: (code) => exits.push(code),
        },
        readSseConfig,
      );
      expect(lines).toEqual([]);
      expect(exits).toEqual([]);
      expect(config).toEqual(readSseConfig([], {}));
    },
  );

  it.each([
    ['mcp', DESTINATION_WORDS],
    ['renewal', DESTINATION_WORDS],
    ['http', HTTP_WORDS],
  ])('YAML %s', (key, words) => {
    expect(() => readSseConfig([], {}, { [key]: 'x' })).toThrow(
      `${key} (config file): ${words}`,
    );
  });
});

describe('the YAML template and validation come from the table', () => {
  const template = generateYamlConfigTemplate(SSE_PARAMETERS);
  const parsed = load(template) as Record<string, unknown>;

  it('the template is valid and sets only defaults', () => {
    expect(validateYamlConfig(SSE_PARAMETERS, parsed).errors).toEqual([]);
    expect(readSseConfig([], {}, parsed)).toMatchObject({
      host: '127.0.0.1',
      port: 3001,
      stateIdleMinutes: 30,
    });
  });

  it('holds sse rows under sse, and no other binary keys', () => {
    expect(Object.keys(parsed).sort()).toEqual(
      ['sse', 'shutdown-timeout', 'state-idle-minutes', 'system-type'].sort(),
    );
    expect(Object.keys(parsed.sse as object).sort()).toEqual(
      [
        'allowed-hosts',
        'allowed-origins',
        'enable-dns-protection',
        'host',
        'port',
        'tls',
      ].sort(),
    );
  });

  it('the validation refuses another binary keys and --transport', () => {
    const { errors } = validateYamlConfig(SSE_PARAMETERS, {
      transport: 'sse',
      mcp: 'TRIAL',
      http: { port: 3000 },
    });
    expect(errors).toEqual([
      SSE_SENTENCE,
      `mcp (config file): ${DESTINATION_WORDS}`,
      `http (config file): ${HTTP_WORDS}`,
    ]);
  });

  describe('through --conf', () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sse-conf-'));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('a missing file gets the template and the start ends 0', async () => {
      const file = path.join(dir, 'conf.yaml');
      const { exits, served } = await start([`--conf=${file}`]);
      expect(exits).toEqual([0]);
      expect(served).toBe(0);
      expect(fs.readFileSync(file, 'utf8')).toBe(template);
    });

    it('a file with a Streamable HTTP key stops the start with its words', async () => {
      const file = path.join(dir, 'conf.yaml');
      fs.writeFileSync(file, 'http:\n  port: 3000\n');
      const { stderr, exits, served } = await start([`--conf=${file}`]);
      expect(stderr).toContain(`http (config file): ${HTTP_WORDS}`);
      expect(exits).toEqual([1]);
      expect(served).toBe(0);
    });
  });
});
