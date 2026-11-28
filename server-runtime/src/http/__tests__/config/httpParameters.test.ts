/**
 * `mcp-abap-adt-http`'s own parameter table:
 * its help lists no destination or SSE option, every option of another
 * binary and `--transport` stop the start with their words, the shared rows
 * are in it, and its YAML template and validation come from it.
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
  mock.restoreAll();
  process.argv = savedArgv;
  process.env = savedEnv;
});

/** Runs the program's `main` with `argv`; the start is expected to stop. */
async function start(argv: string[], env: NodeJS.ProcessEnv = {}) {
  process.argv = ['node', 'mcp-abap-adt-http', ...argv];
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
    StreamableHttpServer.prototype,
    'start',
    async () => undefined,
  );
  await main({
    toolSet: fullToolSet,
    program: 'mcp-abap-adt-http',
    version: '0.0.0-test',
    packageName: '@mcp-abap-adt/http',
  });
  return {
    stderr: written.join(''),
    exits,
    served: served.mock.calls.length,
  };
}

describe("http's help", () => {
  const help = httpHelp();

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
    '--sse-',
    '--post-path',
    'MCP_SSE_',
  ]) {
    it(format('lists no %s', name), () => {
      assert.ok(!help.includes(name));
    });
  }

  for (const name of [
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

describe('--shutdown-timeout is a row of http', () => {
  it('no default: absent unless given', () => {
    assert.equal(readHttpConfig([], {}).shutdownTimeout, undefined);
  });

  it('CLI, env and YAML reach the config, in seconds', () => {
    assert.equal(
      readHttpConfig(['--shutdown-timeout=5'], {}).shutdownTimeout,
      5,
    );
    assert.equal(
      readHttpConfig([], { MCP_SHUTDOWN_TIMEOUT: '7' }).shutdownTimeout,
      7,
    );
    assert.equal(
      readHttpConfig([], {}, { 'shutdown-timeout': 9 }).shutdownTimeout,
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

describe('--state-idle-minutes is a row of http', () => {
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
    assert.equal(readHttpConfig([], {}).stateIdleMinutes, 30);
    assert.equal(
      readHttpConfig(['--state-idle-minutes=45'], {}).stateIdleMinutes,
      45,
    );
    assert.equal(
      readHttpConfig([], { MCP_STATE_IDLE_MINUTES: '40' }).stateIdleMinutes,
      40,
    );
    assert.equal(
      readHttpConfig([], {}, { 'state-idle-minutes': 35 }).stateIdleMinutes,
      35,
    );
  });
});

describe('the Streamable HTTP rows', () => {
  it('defaults: 127.0.0.1:3000, no TLS, no DNS protection', () => {
    const config = readHttpConfig([], {});
    assertMatchObject(config, {
      host: '127.0.0.1',
      port: 3000,
      enableDnsRebindingProtection: false,
    });
    assert.equal(config.tls, undefined);
  });

  it('--host beats --http-host; CLI beats env beats YAML', () => {
    assert.equal(
      readHttpConfig(['--http-host=10.0.0.1', '--host=0.0.0.0'], {}).host,
      '0.0.0.0',
    );
    assert.equal(
      readHttpConfig(
        ['--http-port=8080'],
        { MCP_HTTP_PORT: '8081' },
        { http: { port: 8082 } },
      ).port,
      8080,
    );
    assert.equal(
      readHttpConfig([], { MCP_HTTP_PORT: '8081' }, { http: { port: 8082 } })
        .port,
      8081,
    );
    assert.equal(readHttpConfig([], {}, { http: { port: 8082 } }).port, 8082);
  });

  it('the DNS-rebinding rows, in each form', () => {
    assertMatchObject(
      readHttpConfig(
        [
          '--http-allowed-origins=https://a.com,https://b.com',
          '--http-allowed-hosts=localhost:3000',
          '--http-enable-dns-protection',
        ],
        {},
      ),
      {
        allowedOrigins: ['https://a.com', 'https://b.com'],
        allowedHosts: ['localhost:3000'],
        enableDnsRebindingProtection: true,
      },
    );
    assertMatchObject(
      readHttpConfig([], {
        MCP_HTTP_ALLOWED_ORIGINS: 'https://a.com',
        MCP_HTTP_ENABLE_DNS_PROTECTION: 'true',
      }),
      {
        allowedOrigins: ['https://a.com'],
        enableDnsRebindingProtection: true,
      },
    );
    assertMatchObject(
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
      {
        allowedHosts: ['localhost:3000'],
        enableDnsRebindingProtection: true,
      },
    );
  });

  it('TLS: cert and key together, from the CLI, the env or http.tls', () => {
    assert.deepStrictEqual(
      readHttpConfig(['--tls-cert=/c.pem', '--tls-key=/k.pem'], {}).tls,
      { cert: '/c.pem', key: '/k.pem' },
    );
    assert.deepStrictEqual(
      readHttpConfig(
        [],
        {},
        { http: { tls: { cert: '/c', key: '/k', ca: '/a' } } },
      ).tls,
      { cert: '/c', key: '/k', ca: '/a' },
    );
    assertThrows(
      () => readHttpConfig(['--tls-cert=/c.pem'], {}),
      'TLS needs both --tls-cert and --tls-key',
    );
  });

  it('a port out of range is refused, naming the form', () => {
    assertThrows(
      () => readHttpConfig(['--port=70000'], {}),
      'Invalid --port: "70000". Must be a port between 0 and 65535 (0: one the system chooses)',
    );
  });
});

// The binary fixes its tool set: the flag and the YAML key are gone,
// each word answered with the binary of this transport that serves it.
describe('--exposition is gone', () => {
  it('the flag stops the start, naming the binary its words ask for', () => {
    assertThrows(
      () => readHttpConfig(['--exposition=readonly'], {}),
      new ParameterRefusal(
        '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the readonly tools alone (with system and search) are served by `mcp-abap-adt-http-ro` (`@mcp-abap-adt/http-ro`)',
      ),
    );
    assertThrows(
      () => readHttpConfig(['--exposition', 'readonly,high,debug'], {}),
      new ParameterRefusal(
        '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the high tools are served, beside the readonly ones, by `mcp-abap-adt-http` (`@mcp-abap-adt/http`)',
      ),
    );
  });

  it('in the config file too, and the help lists no such option', () => {
    assertThrows(
      () => readHttpConfig([], {}, { exposition: 'readonly' }),
      new ParameterRefusal(
        'exposition (config file) is gone (19.0.0): the binary fixes its tool set, so remove it; the readonly tools alone (with system and search) are served by `mcp-abap-adt-http-ro` (`@mcp-abap-adt/http-ro`)',
      ),
    );
  });
});

describe('--transport, with any value, stops the start with the sentence of the binary that serves it', () => {
  for (const [argv, env] of [
    [['--transport=http'], {}],
    [['--transport=streamable-http'], {}],
    [['--transport=stdio'], {}],
    [['--transport', 'sse'], {}],
    [[], { MCP_TRANSPORT: 'http' }],
  ] as const) {
    it(format('%j %j', argv, env), async () => {
      const { stderr, exits, served } = await start([...argv], { ...env });
      assert.equal(stderr, `[MCP] ${HTTP_SENTENCE}\n`);
      assert.deepStrictEqual(exits, [1]);
      assert.equal(served, 0);
    });
  }

  it('in the config file too', () => {
    assertThrows(
      () => readHttpConfig([], {}, { transport: 'http' }),
      HTTP_SENTENCE,
    );
  });
});

describe('every removed parameter stops http with its words', () => {
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
    ['--sse-host=0.0.0.0', '--sse-host', SSE_WORDS],
    ['--sse-port=3001', '--sse-port', SSE_WORDS],
    ['--sse-path=/sse', '--sse-path', SSE_WORDS],
    ['--post-path=/messages', '--post-path', SSE_WORDS],
    ['--sse-allowed-hosts=a:1', '--sse-allowed-hosts', SSE_WORDS],
    ['--sse-allowed-origins=http://a', '--sse-allowed-origins', SSE_WORDS],
    ['--sse-enable-dns-protection', '--sse-enable-dns-protection', SSE_WORDS],
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
          HTTP_PARAMETERS,
          [],
          { ...env },
          {
            stderr: (line) => lines.push(line),
            exit: (code) => exits.push(code),
          },
          readHttpConfig,
        );
        assert.deepStrictEqual(lines, []);
        assert.deepStrictEqual(exits, []);
        assert.deepStrictEqual(config, readHttpConfig([], {}));
      },
    );
  }

  for (const [key, words] of [
    ['mcp', DESTINATION_WORDS],
    ['env-path', DESTINATION_WORDS],
    ['browser', DESTINATION_WORDS],
    ['sse', SSE_WORDS],
  ]) {
    it(format('YAML %s', key), () => {
      assertThrows(
        () => readHttpConfig([], {}, { [key]: 'x' }),
        `${key} (config file): ${words}`,
      );
    });
  }
});

describe('the YAML template and validation come from the table', () => {
  const template = generateYamlConfigTemplate(HTTP_PARAMETERS);
  const parsed = load(template) as YamlConfig;

  it('the template is valid and sets only defaults', () => {
    assert.deepStrictEqual(
      validateYamlConfig(HTTP_PARAMETERS, parsed).errors,
      [],
    );
    assertMatchObject(readHttpConfig([], {}, parsed), {
      host: '127.0.0.1',
      port: 3000,
      stateIdleMinutes: 30,
    });
  });

  it('holds http rows under http, and no other binary keys', () => {
    assert.deepStrictEqual(
      Object.keys(parsed).sort(),
      [
        'batch',
        'enable-data-tools',
        'http',
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
      openEnvelopes: null,
      partsPerEnvelope: null,
    });
    assert.deepStrictEqual(
      Object.keys(parsed.http as object).sort(),
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
    assert.deepStrictEqual(errors, [
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
      assert.deepStrictEqual(exits, [0]);
      assert.equal(served, 0);
      assert.equal(fs.readFileSync(file, 'utf8'), template);
    });

    it('a file with a destination key stops the start with its words', async () => {
      const file = path.join(dir, 'conf.yaml');
      fs.writeFileSync(file, 'mcp: TRIAL\n');
      const { stderr, exits, served } = await start([`--conf=${file}`]);
      assert.ok(stderr.includes(`mcp (config file): ${DESTINATION_WORDS}`));
      assert.deepStrictEqual(exits, [1]);
      assert.equal(served, 0);
    });
  });
});
