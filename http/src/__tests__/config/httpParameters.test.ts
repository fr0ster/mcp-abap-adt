/**
 * `mcp-abap-adt-http`'s own parameter table (D38, D39, spec §10.1, §14.1):
 * its help lists no destination or SSE option, every option of another
 * binary and `--transport` stop the start with their words, the shared rows
 * are in it, and its YAML template and validation come from it.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  generateYamlConfigTemplate,
  readStartupConfig,
  validateExposition,
  validateYamlConfig,
} from '@mcp-abap-adt/lib/config';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { load } from 'js-yaml';
import { HTTP_PARAMETERS, readHttpConfig } from '../../config/httpParameters';
import { httpHelp, main } from '../../launcher';
import { StreamableHttpServer } from '../../StreamableHttpServer';

const HTTP_SENTENCE =
  '`--transport` is gone: `mcp-abap-adt-http` serves Streamable HTTP; for stdio run `mcp-abap-adt`, for SSE `mcp-abap-adt-sse`';
const SSE_WORDS = 'SSE is served by `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`)';
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
  process.argv = ['node', 'mcp-abap-adt-http', ...argv];
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
    .spyOn(StreamableHttpServer.prototype, 'start')
    .mockResolvedValue(undefined);
  await main({
    toolSet: fullToolSet,
    program: 'mcp-abap-adt-http',
    version: '0.0.0-test',
  });
  return {
    stderr: written.join(''),
    exits,
    served: served.mock.calls.length,
  };
}

describe("http's help", () => {
  const help = httpHelp();

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
    '--sse-',
    '--post-path',
    'MCP_SSE_',
  ])('lists no %s', (name) => {
    expect(help).not.toContain(name);
  });

  it.each([
    '--host',
    '--http-host',
    'MCP_HTTP_HOST',
    '--port',
    '--http-port',
    'MCP_HTTP_PORT',
    '--path',
    '--http-path',
    '--http-json-response',
    'MCP_HTTP_ENABLE_JSON_RESPONSE',
    '--http-allowed-hosts',
    'MCP_HTTP_ALLOWED_HOSTS',
    '--http-allowed-origins',
    'MCP_HTTP_ALLOWED_ORIGINS',
    '--http-enable-dns-protection',
    'MCP_HTTP_ENABLE_DNS_PROTECTION',
    '--tls-cert',
    '--tls-key',
    '--tls-ca',
    'MCP_TLS_CERT',
    '--system-type',
    '--exposition',
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

describe('--shutdown-timeout is a row of http (D33)', () => {
  it('no default: absent unless given', () => {
    expect(readHttpConfig([], {}).shutdownTimeout).toBeUndefined();
  });

  it('CLI, env and YAML reach the config, in seconds', () => {
    expect(readHttpConfig(['--shutdown-timeout=5'], {}).shutdownTimeout).toBe(
      5,
    );
    expect(
      readHttpConfig([], { MCP_SHUTDOWN_TIMEOUT: '7' }).shutdownTimeout,
    ).toBe(7);
    expect(
      readHttpConfig([], {}, { 'shutdown-timeout': 9 }).shutdownTimeout,
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

describe('--state-idle-minutes is a row of http', () => {
  it("29 stops the start with main's words", async () => {
    const { stderr, exits, served } = await start(['--state-idle-minutes=29']);
    expect(stderr).toContain(
      'Invalid --state-idle-minutes: "29". Must be a whole number of minutes, at least 30',
    );
    expect(exits).toEqual([1]);
    expect(served).toBe(0);
  });

  it('CLI, env and YAML reach the config; 30 by default', () => {
    expect(readHttpConfig([], {}).stateIdleMinutes).toBe(30);
    expect(
      readHttpConfig(['--state-idle-minutes=45'], {}).stateIdleMinutes,
    ).toBe(45);
    expect(
      readHttpConfig([], { MCP_STATE_IDLE_MINUTES: '40' }).stateIdleMinutes,
    ).toBe(40);
    expect(
      readHttpConfig([], {}, { 'state-idle-minutes': 35 }).stateIdleMinutes,
    ).toBe(35);
  });
});

describe('the Streamable HTTP rows', () => {
  it('defaults: 127.0.0.1:3000, no TLS, no DNS protection', () => {
    const config = readHttpConfig([], {});
    expect(config).toMatchObject({
      host: '127.0.0.1',
      port: 3000,
      enableDnsRebindingProtection: false,
    });
    expect(config.tls).toBeUndefined();
  });

  it('--host beats --http-host; CLI beats env beats YAML', () => {
    expect(
      readHttpConfig(['--http-host=10.0.0.1', '--host=0.0.0.0'], {}).host,
    ).toBe('0.0.0.0');
    expect(
      readHttpConfig(
        ['--http-port=8080'],
        { MCP_HTTP_PORT: '8081' },
        { http: { port: 8082 } },
      ).port,
    ).toBe(8080);
    expect(
      readHttpConfig([], { MCP_HTTP_PORT: '8081' }, { http: { port: 8082 } })
        .port,
    ).toBe(8081);
    expect(readHttpConfig([], {}, { http: { port: 8082 } }).port).toBe(8082);
  });

  it('the DNS-rebinding rows, in each form', () => {
    expect(
      readHttpConfig(
        [
          '--http-allowed-origins=https://a.com,https://b.com',
          '--http-allowed-hosts=localhost:3000',
          '--http-enable-dns-protection',
        ],
        {},
      ),
    ).toMatchObject({
      allowedOrigins: ['https://a.com', 'https://b.com'],
      allowedHosts: ['localhost:3000'],
      enableDnsRebindingProtection: true,
    });
    expect(
      readHttpConfig([], {
        MCP_HTTP_ALLOWED_ORIGINS: 'https://a.com',
        MCP_HTTP_ENABLE_DNS_PROTECTION: 'true',
      }),
    ).toMatchObject({
      allowedOrigins: ['https://a.com'],
      enableDnsRebindingProtection: true,
    });
    expect(
      readHttpConfig(
        [],
        {},
        {
          http: {
            'allowed-hosts': ['localhost:3000'],
            'enable-dns-protection': true,
          },
        },
      ),
    ).toMatchObject({
      allowedHosts: ['localhost:3000'],
      enableDnsRebindingProtection: true,
    });
  });

  it('TLS: cert and key together, from the CLI, the env or http.tls', () => {
    expect(
      readHttpConfig(['--tls-cert=/c.pem', '--tls-key=/k.pem'], {}).tls,
    ).toEqual({ cert: '/c.pem', key: '/k.pem' });
    expect(
      readHttpConfig(
        [],
        {},
        { http: { tls: { cert: '/c', key: '/k', ca: '/a' } } },
      ).tls,
    ).toEqual({ cert: '/c', key: '/k', ca: '/a' });
    expect(() => readHttpConfig(['--tls-cert=/c.pem'], {})).toThrow(
      'TLS needs both --tls-cert and --tls-key',
    );
  });

  it('a port out of range is refused, naming the form', () => {
    expect(() => readHttpConfig(['--port=70000'], {})).toThrow(
      'Invalid --port: "70000". Must be a port between 1 and 65535',
    );
  });
});

describe('--exposition', () => {
  it('readonly,debug is accepted', () => {
    const { exposition } = readHttpConfig(['--exposition=readonly,debug'], {});
    expect(exposition).toEqual(['readonly', 'debug']);
    expect(() => validateExposition(exposition ?? [])).not.toThrow();
  });
});

describe('--transport, with any value, stops the start with the D39 sentence', () => {
  it.each([
    [['--transport=http'], {}],
    [['--transport=streamable-http'], {}],
    [['--transport=stdio'], {}],
    [['--transport', 'sse'], {}],
    [[], { MCP_TRANSPORT: 'http' }],
  ] as const)('%j %j', async (argv, env) => {
    const { stderr, exits, served } = await start([...argv], { ...env });
    expect(stderr).toBe(`[MCP] ${HTTP_SENTENCE}\n`);
    expect(exits).toEqual([1]);
    expect(served).toBe(0);
  });

  it('in the config file too', () => {
    expect(() => readHttpConfig([], {}, { transport: 'http' })).toThrow(
      HTTP_SENTENCE,
    );
  });
});

describe('every removed parameter stops http with its words (§10.1)', () => {
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
    ['--browser=none', '--browser', DESTINATION_WORDS],
    ['--browser-program=/x', '--browser-program', DESTINATION_WORDS],
    ['--browser-auth-port=61001', '--browser-auth-port', DESTINATION_WORDS],
    ['--login-timeout=60', '--login-timeout', DESTINATION_WORDS],
    ['--renewal=refresh-only', '--renewal', DESTINATION_WORDS],
    ['--auth-debug', '--auth-debug', DESTINATION_WORDS],
    ['--sse-host=0.0.0.0', '--sse-host', SSE_WORDS],
    ['--sse-port=3001', '--sse-port', SSE_WORDS],
    ['--sse-path=/sse', '--sse-path', SSE_WORDS],
    ['--post-path=/messages', '--post-path', SSE_WORDS],
    ['--sse-allowed-hosts=a:1', '--sse-allowed-hosts', SSE_WORDS],
    ['--sse-allowed-origins=http://a', '--sse-allowed-origins', SSE_WORDS],
    ['--sse-enable-dns-protection', '--sse-enable-dns-protection', SSE_WORDS],
  ])('%s', async (arg, form, words) => {
    const { stderr, exits, served } = await start([arg]);
    expect(stderr).toBe(`[MCP] ${form}: ${words}\n`);
    expect(exits).toEqual([1]);
    expect(served).toBe(0);
  });

  it.each([
    [
      'MCP_SSE_*',
      {
        MCP_SSE_PORT: '3005',
        MCP_SSE_HOST: '0.0.0.0',
        MCP_SSE_ALLOWED_HOSTS: 'a:1',
        MCP_SSE_ENABLE_DNS_PROTECTION: 'true',
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
        HTTP_PARAMETERS,
        [],
        { ...env },
        {
          stderr: (line) => lines.push(line),
          exit: (code) => exits.push(code),
        },
        readHttpConfig,
      );
      expect(lines).toEqual([]);
      expect(exits).toEqual([]);
      expect(config).toEqual(readHttpConfig([], {}));
    },
  );

  it.each([
    ['mcp', DESTINATION_WORDS],
    ['env-path', DESTINATION_WORDS],
    ['browser', DESTINATION_WORDS],
    ['sse', SSE_WORDS],
  ])('YAML %s', (key, words) => {
    expect(() => readHttpConfig([], {}, { [key]: 'x' })).toThrow(
      `${key} (config file): ${words}`,
    );
  });
});

describe('the YAML template and validation come from the table', () => {
  const template = generateYamlConfigTemplate(HTTP_PARAMETERS);
  const parsed = load(template) as Record<string, unknown>;

  it('the template is valid and sets only defaults', () => {
    expect(validateYamlConfig(HTTP_PARAMETERS, parsed).errors).toEqual([]);
    expect(readHttpConfig([], {}, parsed)).toMatchObject({
      host: '127.0.0.1',
      port: 3000,
      stateIdleMinutes: 30,
      exposition: ['readonly', 'high'],
    });
  });

  it('holds http rows under http, and no other binary keys', () => {
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'exposition',
        'http',
        'shutdown-timeout',
        'state-idle-minutes',
        'system-type',
      ].sort(),
    );
    expect(Object.keys(parsed.http as object).sort()).toEqual(
      [
        'allowed-hosts',
        'allowed-origins',
        'enable-dns-protection',
        'host',
        'json-response',
        'port',
        'tls',
      ].sort(),
    );
  });

  it('the validation refuses another binary keys and --transport', () => {
    const { errors } = validateYamlConfig(HTTP_PARAMETERS, {
      transport: 'http',
      mcp: 'TRIAL',
      sse: { port: 3001 },
    });
    expect(errors).toEqual([
      HTTP_SENTENCE,
      `mcp (config file): ${DESTINATION_WORDS}`,
      `sse (config file): ${SSE_WORDS}`,
    ]);
  });

  describe('through --conf', () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'http-conf-'));
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

    it('a file with a destination key stops the start with its words', async () => {
      const file = path.join(dir, 'conf.yaml');
      fs.writeFileSync(file, 'mcp: TRIAL\n');
      const { stderr, exits, served } = await start([`--conf=${file}`]);
      expect(stderr).toContain(`mcp (config file): ${DESTINATION_WORDS}`);
      expect(exits).toEqual([1]);
      expect(served).toBe(0);
    });
  });
});
