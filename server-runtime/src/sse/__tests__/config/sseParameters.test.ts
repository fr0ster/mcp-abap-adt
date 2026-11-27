/**
 * `mcp-abap-adt-sse`'s own parameter table: its help lists every SSE option of today under its name and no
 * destination or Streamable HTTP option, every option of another binary and
 * `--transport` stop the start with their words, the shared rows are in it,
 * and its YAML template and validation come from it.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import type { YamlConfig } from '@mcp-abap-adt/lib/config';
import {
  generateYamlConfigTemplate,
  ParameterRefusal,
  readStartupConfig,
  validateYamlConfig,
} from '@mcp-abap-adt/lib/config';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { load } from 'js-yaml';
import {
  assertMatchObject,
  assertThrows,
} from '../../../../../src/__tests__/helpers/assertions';
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
  mock.restoreAll();
  process.argv = savedArgv;
  process.env = savedEnv;
});

/** Runs the program's `main` with `argv`; the start is expected to stop. */
async function start(argv: string[], env: NodeJS.ProcessEnv = {}) {
  process.argv = ['node', 'mcp-abap-adt-sse', ...argv];
  process.env = cleanEnv(env);
  const written: string[] = [];
  const exits: number[] = [];
  mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
    written.push(String(chunk));
    return true;
  });
  mock.method(process, 'exit', ((code?: number) => {
    exits.push(code ?? 0);
  }) as never);
  // A start that is not stopped serves nothing here: no socket, no stdin.
  const served = mock.method(
    SseServer.prototype,
    'start',
    async () => undefined,
  );
  await main({
    toolSet: fullToolSet,
    program: 'mcp-abap-adt-sse',
    version: '0.0.0-test',
    packageName: '@mcp-abap-adt/sse',
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

  for (const name of [
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
  ]) {
    it(format('lists no %s', name), () => {
      assert.ok(!help.includes(name));
    });
  }

  for (const name of [
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
    // Named as the environment that is not read (D26 D2: headers only).
    'SAP_DEBUG_* of the',
  ]) {
    it(format('lists %s', name), () => {
      assert.ok(help.includes(name));
    });
  }
});

describe('every SSE option of today is read under its name', () => {
  it('the CLI forms', () => {
    assertMatchObject(
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
      {
        host: '0.0.0.0',
        port: 3005,
        ssePath: '/events',
        postPath: '/msgs',
        allowedHosts: ['localhost:3005'],
        allowedOrigins: ['https://a.com', 'https://b.com'],
        enableDnsRebindingProtection: true,
      },
    );
  });

  it('the env forms', () => {
    assertMatchObject(
      readSseConfig([], {
        MCP_SSE_HOST: '0.0.0.0',
        MCP_SSE_PORT: '3006',
        MCP_SSE_ALLOWED_HOSTS: 'localhost:3006',
        MCP_SSE_ALLOWED_ORIGINS: 'https://a.com',
        MCP_SSE_ENABLE_DNS_PROTECTION: 'true',
      }),
      {
        host: '0.0.0.0',
        port: 3006,
        allowedHosts: ['localhost:3006'],
        allowedOrigins: ['https://a.com'],
        enableDnsRebindingProtection: true,
      },
    );
  });

  it('the YAML forms under sse, and the defaults', () => {
    assertMatchObject(
      readSseConfig(
        [],
        {},
        {
          sse: {
            port: 3007,
            'allowed-hosts': ['localhost:3007'],
            'enable-dns-protection': true,
            tls: { cert: '/c', key: '/k' },
          },
        },
      ),
      {
        host: '127.0.0.1',
        port: 3007,
        allowedHosts: ['localhost:3007'],
        tls: { cert: '/c', key: '/k' },
      },
    );
    assertMatchObject(readSseConfig([], {}), {
      host: '127.0.0.1',
      port: 3001,
      enableDnsRebindingProtection: false,
    });
  });
});

describe('--shutdown-timeout is a row of sse', () => {
  it('no default: absent unless given', () => {
    assert.equal(readSseConfig([], {}).shutdownTimeout, undefined);
  });

  it('CLI, env and YAML reach the config, in seconds', () => {
    assert.equal(
      readSseConfig(['--shutdown-timeout=5'], {}).shutdownTimeout,
      5,
    );
    assert.equal(
      readSseConfig([], { MCP_SHUTDOWN_TIMEOUT: '7' }).shutdownTimeout,
      7,
    );
    assert.equal(
      readSseConfig([], {}, { 'shutdown-timeout': 9 }).shutdownTimeout,
      9,
    );
  });

  for (const value of ['0', '1.5', 'abc', '86401']) {
    it(format('%s stops the start', value), async () => {
      const { stderr, exits, served } = await start([
        `--shutdown-timeout=${value}`,
      ]);
      assert.ok(stderr.includes('Invalid --shutdown-timeout'));
      assert.deepStrictEqual(exits, [1]);
      assert.equal(served, 0);
    });
  }
});

describe('--state-idle-minutes is a row of sse', () => {
  it("29 stops the start with main's words", async () => {
    const { stderr, exits, served } = await start(['--state-idle-minutes=29']);
    assert.ok(
      stderr.includes(
        'Invalid --state-idle-minutes: "29". Must be a whole number of minutes, at least 30',
      ),
    );
    assert.deepStrictEqual(exits, [1]);
    assert.equal(served, 0);
  });

  it('CLI, env and YAML reach the config; 30 by default', () => {
    assert.equal(readSseConfig([], {}).stateIdleMinutes, 30);
    assert.equal(
      readSseConfig(['--state-idle-minutes=45'], {}).stateIdleMinutes,
      45,
    );
    assert.equal(
      readSseConfig([], { MCP_STATE_IDLE_MINUTES: '40' }).stateIdleMinutes,
      40,
    );
    assert.equal(
      readSseConfig([], {}, { 'state-idle-minutes': 35 }).stateIdleMinutes,
      35,
    );
  });
});

// The binary fixes its tool set: the flag and the YAML key are gone,
// each word answered with the binary of this transport that serves it.
describe('--exposition is gone', () => {
  it('the flag stops the start, naming the binary its words ask for', () => {
    assertThrows(
      () => readSseConfig(['--exposition=readonly'], {}),
      new ParameterRefusal(
        '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the readonly tools alone (with system and search) are served by `mcp-abap-adt-sse-ro` (`@mcp-abap-adt/sse-ro`)',
      ),
    );
    assertThrows(
      () => readSseConfig(['--exposition', 'readonly,high,debug'], {}),
      new ParameterRefusal(
        '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the high tools are served, beside the readonly ones, by `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`)',
      ),
    );
  });

  it('in the config file too, and the help lists no such option', () => {
    assertThrows(
      () => readSseConfig([], {}, { exposition: 'readonly' }),
      new ParameterRefusal(
        'exposition (config file) is gone (19.0.0): the binary fixes its tool set, so remove it; the readonly tools alone (with system and search) are served by `mcp-abap-adt-sse-ro` (`@mcp-abap-adt/sse-ro`)',
      ),
    );
  });
});

describe('--transport, with any value, stops the start with the sentence of the binary that serves it', () => {
  for (const [argv, env] of [
    [['--transport=sse'], {}],
    [['--transport=http'], {}],
    [['--transport=stdio'], {}],
    [['--transport', 'sse'], {}],
    [[], { MCP_TRANSPORT: 'sse' }],
  ] as const) {
    it(format('%j %j', argv, env), async () => {
      const { stderr, exits, served } = await start([...argv], { ...env });
      assert.equal(stderr, `[MCP] ${SSE_SENTENCE}\n`);
      assert.deepStrictEqual(exits, [1]);
      assert.equal(served, 0);
    });
  }

  it('in the config file too', () => {
    assertThrows(
      () => readSseConfig([], {}, { transport: 'sse' }),
      SSE_SENTENCE,
    );
  });
});

describe('every removed parameter stops sse with its words', () => {
  for (const [arg, form, words] of [
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
    ['--ashost=value-one', '--ashost', DESTINATION_WORDS],
    ['--sysnr=00', '--sysnr', DESTINATION_WORDS],
    ['--mshost=value-one', '--mshost', DESTINATION_WORDS],
    ['--msserv=value-one', '--msserv', DESTINATION_WORDS],
    ['--sysid=value-one', '--sysid', DESTINATION_WORDS],
    ['--group=value-one', '--group', DESTINATION_WORDS],
    ['--saprouter=value-one', '--saprouter', DESTINATION_WORDS],
    ['--client=100', '--client', DESTINATION_WORDS],
    ['--language=EN', '--language', DESTINATION_WORDS],
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
  ]) {
    it(format('%s', arg), async () => {
      const { stderr, exits, served } = await start([arg]);
      assert.equal(stderr, `[MCP] ${form}: ${words}\n`);
      assert.deepStrictEqual(exits, [1]);
      assert.equal(served, 0);
    });
  }

  for (const [_family, env] of [
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
  ] as const) {
    it(
      format(
        "another binary's %s is not read: the start proceeds and the value is not used",
        _family,
      ),
      () => {
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
        assert.deepStrictEqual(lines, []);
        assert.deepStrictEqual(exits, []);
        assert.deepStrictEqual(config, readSseConfig([], {}));
      },
    );
  }

  for (const [key, words] of [
    ['mcp', DESTINATION_WORDS],
    ['renewal', DESTINATION_WORDS],
    ['http', HTTP_WORDS],
  ]) {
    it(format('YAML %s', key), () => {
      assertThrows(
        () => readSseConfig([], {}, { [key]: 'x' }),
        `${key} (config file): ${words}`,
      );
    });
  }
});

describe('the YAML template and validation come from the table', () => {
  const template = generateYamlConfigTemplate(SSE_PARAMETERS);
  const parsed = load(template) as YamlConfig;

  it('the template is valid and sets only defaults', () => {
    assert.deepStrictEqual(
      validateYamlConfig(SSE_PARAMETERS, parsed).errors,
      [],
    );
    assertMatchObject(readSseConfig([], {}, parsed), {
      host: '127.0.0.1',
      port: 3001,
      stateIdleMinutes: 30,
    });
  });

  it('holds sse rows under sse, and no other binary keys', () => {
    assert.deepStrictEqual(
      Object.keys(parsed).sort(),
      [
        'batch',
        'enable-data-tools',
        'sse',
        'requests',
        'restrictions',
        'session-keep-alive-minutes',
        'shutdown-timeout',
        'state-idle-minutes',
        'system-type',
      ].sort(),
    );
    // No bound is the server's own: the template states none.
    assert.deepStrictEqual(parsed.batch, {
      keepRawParts: false,
      partsPerEnvelope: null,
    });
    assert.deepStrictEqual(parsed.requests, { inFlight: null });
    assert.deepStrictEqual(
      Object.keys(parsed.sse as object).sort(),
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
    assert.deepStrictEqual(errors, [
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
      assert.deepStrictEqual(exits, [0]);
      assert.equal(served, 0);
      assert.equal(fs.readFileSync(file, 'utf8'), template);
    });

    it('a file with a Streamable HTTP key stops the start with its words', async () => {
      const file = path.join(dir, 'conf.yaml');
      fs.writeFileSync(file, 'http:\n  port: 3000\n');
      const { stderr, exits, served } = await start([`--conf=${file}`]);
      assert.ok(stderr.includes(`http (config file): ${HTTP_WORDS}`));
      assert.deepStrictEqual(exits, [1]);
      assert.equal(served, 0);
    });
  });
});
