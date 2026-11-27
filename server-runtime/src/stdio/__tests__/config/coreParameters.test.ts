/**
 * `mcp-abap-adt`'s own parameter table: its
 * help lists no HTTP or SSE option, every option of another binary and
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
import { NO_IDLE_BOUND } from '@mcp-abap-adt/lib/state';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { STDIO_DEFAULT_MAX_BUFFER_SIZE } from '@modelcontextprotocol/sdk/shared/stdio.js';
import { load } from 'js-yaml';
import { assertThrows } from '../../../../../src/__tests__/helpers/assertions';
import {
  STDIO_MIN_MESSAGE_LIMIT,
  STDIO_READ_MARGIN,
} from '../../boundedStdioTransport';
import {
  CORE_PARAMETERS,
  readCoreConfig,
  stdioMessageLimitRefusal,
} from '../../config/coreParameters';
import { coreHelp, main } from '../../launcher';
import { StdioServer } from '../../StdioServer';

const STDIO_SENTENCE =
  '`--transport` is gone: `mcp-abap-adt` serves stdio; for Streamable HTTP run `mcp-abap-adt-http`, for SSE `mcp-abap-adt-sse` (compact: `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-sse`)';
const SSE_WORDS = 'SSE is served by `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`)';
const HTTP_WORDS =
  'Streamable HTTP is served by `mcp-abap-adt-http` (`@mcp-abap-adt/http`)';
const TLS_WORDS =
  'TLS is an option of `mcp-abap-adt-http` and `mcp-abap-adt-sse`';

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
  process.argv = ['node', 'mcp-abap-adt', ...argv];
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
    StdioServer.prototype,
    'start',
    async () => undefined,
  );
  // The connection at start is the launcher's own step: not made here.
  const atStart: Awaited<ReturnType<StdioServer['connectAtStart']>> = {
    session: 'logged_on',
  };
  mock.method(StdioServer.prototype, 'connectAtStart', async () => atStart);
  await main({
    toolSet: fullToolSet,
    program: 'mcp-abap-adt',
    version: '0.0.0-test',
    packageName: '@mcp-abap-adt/core',
  });
  return {
    stderr: written.join(''),
    exits,
    served: served.mock.calls.length,
    /** The servers whose start was called. */
    servers: served.mock.calls.map((call) =>
      call.this instanceof StdioServer ? call.this : undefined,
    ),
  };
}

describe("core's help", () => {
  const help = coreHelp();

  for (const name of [
    '--transport',
    '--host',
    '--port',
    '--path',
    '--http-',
    'MCP_HTTP_',
    '--sse-',
    '--post-path',
    'MCP_SSE_',
    '--tls-',
    'MCP_TLS_',
    '--allow-destination-header',
    'x-sap-debug-',
    // stdio has no idle bound (20.1.1): the client governs the server's life.
    '--state-idle-minutes',
    'MCP_STATE_IDLE_MINUTES',
    'state-idle-minutes',
    'HELD STATE',
  ]) {
    it(format('lists no %s', name), () => {
      assert.ok(!help.includes(name));
    });
  }

  for (const name of [
    '--mcp',
    '--env',
    '--env-path',
    'MCP_ENV_PATH',
    '--auth-broker-path',
    '--unsafe',
    '--browser',
    '--browser-program',
    '--browser-auth-port',
    '--renewal',
    '--login-timeout',
    'MCP_LOGIN_TIMEOUT',
    '--connection-type',
    '--system-type',
    '--conf',
    '--shutdown-timeout',
    'MCP_SHUTDOWN_TIMEOUT',
    'SAP_DEBUG_TERMINAL_ID',
    'SAP_DEBUG_IDE_ID',
  ]) {
    it(format('lists %s', name), () => {
      assert.ok(help.includes(name));
    });
  }

  it("names the debugger ids' sources: the destination's .env, then the environment", () => {
    const block = help.slice(help.indexOf('SAP_DEBUG_TERMINAL_ID'));
    assert.ok(
      block
        .replace(/\s+/g, ' ')
        .includes("First found: the destination's .env; the environment."),
    );
  });
});

describe('--shutdown-timeout is a row of core', () => {
  it('no default: absent unless given', () => {
    assert.equal(readCoreConfig([], {}).shutdownTimeout, undefined);
  });

  it('CLI, env and YAML reach the config, in seconds', () => {
    assert.equal(
      readCoreConfig(['--shutdown-timeout=5'], {}).shutdownTimeout,
      5,
    );
    assert.equal(
      readCoreConfig([], { MCP_SHUTDOWN_TIMEOUT: '7' }).shutdownTimeout,
      7,
    );
    assert.equal(
      readCoreConfig([], {}, { 'shutdown-timeout': 9 }).shutdownTimeout,
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

describe('--stdio-message-limit is a row of core', () => {
  it("absent: the MCP SDK client's default read buffer reaches the transport", async () => {
    assert.equal(readCoreConfig([], {}).stdioMessageLimit, undefined);
    const { servers } = await start(['--system-type=onprem']);
    const [server] = servers;
    assert.ok(server !== undefined, 'no server was started');
    assert.equal(
      server.stdioTransport().cap,
      STDIO_DEFAULT_MAX_BUFFER_SIZE - STDIO_READ_MARGIN,
    );
  });

  it('CLI, env and YAML reach the config, in bytes', () => {
    assert.equal(
      readCoreConfig(['--stdio-message-limit=4194304'], {}).stdioMessageLimit,
      4194304,
    );
    assert.equal(
      readCoreConfig([], { MCP_STDIO_MESSAGE_LIMIT: '5242880' })
        .stdioMessageLimit,
      5242880,
    );
    assert.equal(
      readCoreConfig([], {}, { 'stdio-message-limit': 6291456 })
        .stdioMessageLimit,
      6291456,
    );
  });

  it('the CLI wins over the environment', () => {
    assert.equal(
      readCoreConfig(['--stdio-message-limit=4194304'], {
        MCP_STDIO_MESSAGE_LIMIT: '5242880',
      }).stdioMessageLimit,
      4194304,
    );
  });

  it("the stated limit reaches the started server's transport, less one pipe read", async () => {
    const { servers } = await start([
      '--system-type=onprem',
      '--stdio-message-limit=4194304',
    ]);
    const [server] = servers;
    assert.ok(server !== undefined, 'no server was started');
    assert.equal(server.stdioTransport().cap, 4194304 - STDIO_READ_MARGIN);
  });

  for (const value of [
    '0',
    '-5',
    '1.5',
    'abc',
    'secret-looking-value',
    String(STDIO_MIN_MESSAGE_LIMIT - 1),
  ]) {
    it(format('%s stops the start, the value not echoed', value), async () => {
      const { stderr, exits, served } = await start([
        '--system-type=onprem',
        `--stdio-message-limit=${value}`,
      ]);
      assert.ok(
        stderr.includes(stdioMessageLimitRefusal('--stdio-message-limit')),
        stderr,
      );
      assert.ok(!stderr.includes(`"${value}"`), stderr);
      assert.deepStrictEqual(exits, [1]);
      assert.equal(served, 0);
    });
  }

  it('the smallest limit is accepted', () => {
    assert.equal(
      readCoreConfig([`--stdio-message-limit=${STDIO_MIN_MESSAGE_LIMIT}`], {})
        .stdioMessageLimit,
      STDIO_MIN_MESSAGE_LIMIT,
    );
  });

  const shapes: ReadonlyArray<readonly [string, YamlConfig[string]]> = [
    ['a list', [STDIO_MIN_MESSAGE_LIMIT]],
    ['a fraction', STDIO_MIN_MESSAGE_LIMIT + 0.5],
    ['a boolean', true],
  ];
  for (const [shape, value] of shapes) {
    it(format('YAML %s is refused, never coerced', shape), () => {
      assertThrows(
        () => readCoreConfig([], {}, { 'stdio-message-limit': value }),
        stdioMessageLimitRefusal('stdio-message-limit (config file)'),
      );
    });
  }

  it('a blank value counts as not given: the default', () => {
    assert.equal(
      readCoreConfig([], { MCP_STDIO_MESSAGE_LIMIT: '' }).stdioMessageLimit,
      undefined,
    );
  });
});

// stdio has no idle bound (20.1.1): the parameter is gone from core's table.
// Stated to stdio — the CLI flag, the YAML key — it stops the start in the
// removed parameter's words, never ignored, so a configuration that states a
// bound learns it has none. MCP_STATE_IDLE_MINUTES is the HTTP and SSE
// binaries' variable: stdio does not read it (an environment is inherited).
describe('--state-idle-minutes is gone from core', () => {
  const GONE =
    'was removed from `mcp-abap-adt` in 20.1.1: stdio has no idle bound — held state ends by its stop tool, the client closing stdin, the backend or the shutdown; remove it from the configuration (the HTTP and SSE binaries keep it)';

  // Each row's title, written as shown.
  for (const [shown, argv, env, form] of [
    [
      '["--state-idle-minutes=45"] {}',
      ['--state-idle-minutes=45'],
      {},
      '--state-idle-minutes',
    ],
    [
      '["--state-idle-minutes", "45"] {}',
      ['--state-idle-minutes', '45'],
      {},
      '--state-idle-minutes',
    ],
  ] satisfies [string, string[], NodeJS.ProcessEnv, string][]) {
    it(format('%s stops the start, naming %s', shown, form), async () => {
      const { stderr, exits, served } = await start(argv, env);
      assert.ok(stderr.includes(`[MCP] ${form} ${GONE}`));
      assert.deepStrictEqual(exits, [1]);
      assert.equal(served, 0);
    });
  }

  it('the CLI flag and the YAML key are refused by the reader', () => {
    assertThrows(
      () => readCoreConfig(['--state-idle-minutes=45'], {}),
      `--state-idle-minutes ${GONE}`,
    );
    assertThrows(
      () => readCoreConfig([], {}, { 'state-idle-minutes': 45 }),
      `state-idle-minutes (config file) ${GONE}`,
    );
    assert.deepStrictEqual(
      validateYamlConfig(CORE_PARAMETERS, { 'state-idle-minutes': 45 }).errors,
      [`state-idle-minutes (config file) ${GONE}`],
    );
  });

  it('the config carries no bound', () => {
    assert.equal('stateIdleMinutes' in readCoreConfig([], {}), false);
  });

  it('an inherited MCP_STATE_IDLE_MINUTES is not read: stdio starts, with no bound', async () => {
    assert.equal(
      'stateIdleMinutes' in
        readCoreConfig([], { MCP_STATE_IDLE_MINUTES: '45' }),
      false,
    );
    const { stderr, exits, served, servers } = await start(
      ['--system-type=onprem'],
      { MCP_STATE_IDLE_MINUTES: '45' },
    );
    assert.ok(!stderr.includes('MCP_STATE_IDLE_MINUTES'));
    assert.deepStrictEqual(exits, []);
    assert.equal(served, 1);
    assert.equal(servers[0]?.state.idleMinutes, NO_IDLE_BOUND);
  });
});

// The binary fixes its tool set: the flag and the YAML key are gone,
// each word answered with the binary of this transport that serves it.
describe('--exposition is gone', () => {
  it('the flag stops the start, naming the binary its words ask for', () => {
    assertThrows(
      () => readCoreConfig(['--exposition=readonly'], {}),
      new ParameterRefusal(
        '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the readonly tools alone (with system and search) are served by `mcp-abap-adt-ro` (`@mcp-abap-adt/core-ro`)',
      ),
    );
    assertThrows(
      () => readCoreConfig(['--exposition', 'readonly,high,debug'], {}),
      new ParameterRefusal(
        '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the high tools are served, beside the readonly ones, by `mcp-abap-adt` (`@mcp-abap-adt/core`)',
      ),
    );
  });

  it('in the config file too, and the help lists no such option', () => {
    assertThrows(
      () => readCoreConfig([], {}, { exposition: 'readonly' }),
      new ParameterRefusal(
        'exposition (config file) is gone (19.0.0): the binary fixes its tool set, so remove it; the readonly tools alone (with system and search) are served by `mcp-abap-adt-ro` (`@mcp-abap-adt/core-ro`)',
      ),
    );
  });
});

describe('--transport, with any value, stops the start with the sentence of the binary that serves it', () => {
  for (const [argv, env] of [
    [['--transport=stdio'], {}],
    [['--transport=http'], {}],
    [['--transport=sse'], {}],
    [['--transport', 'stdio'], {}],
    [[], { MCP_TRANSPORT: 'stdio' }],
  ] as const) {
    it(format('%j %j', argv, env), async () => {
      const { stderr, exits, served } = await start([...argv], { ...env });
      assert.equal(stderr, `[MCP] ${STDIO_SENTENCE}\n`);
      assert.deepStrictEqual(exits, [1]);
      assert.equal(served, 0);
    });
  }

  it('in the config file too', () => {
    assertThrows(
      () => readCoreConfig([], {}, { transport: 'stdio' }),
      STDIO_SENTENCE,
    );
  });
});

describe('every removed parameter stops core with its words', () => {
  for (const [arg, form, words] of [
    ['--sse-host=0.0.0.0', '--sse-host', SSE_WORDS],
    ['--sse-port=3001', '--sse-port', SSE_WORDS],
    ['--sse-path=/sse', '--sse-path', SSE_WORDS],
    ['--post-path=/messages', '--post-path', SSE_WORDS],
    ['--sse-allowed-hosts=a:1', '--sse-allowed-hosts', SSE_WORDS],
    ['--sse-allowed-origins=http://a', '--sse-allowed-origins', SSE_WORDS],
    ['--sse-enable-dns-protection', '--sse-enable-dns-protection', SSE_WORDS],
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
    ['--tls-cert=/c.pem', '--tls-cert', TLS_WORDS],
    ['--tls-key=/k.pem', '--tls-key', TLS_WORDS],
    ['--tls-ca=/ca.pem', '--tls-ca', TLS_WORDS],
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
    [
      'MCP_HTTP_*',
      {
        MCP_HTTP_PORT: '8080',
        MCP_HTTP_HOST: '0.0.0.0',
        MCP_HTTP_ALLOWED_ORIGINS: 'https://a',
        MCP_HTTP_ENABLE_JSON_RESPONSE: 'true',
      },
    ],
    [
      'MCP_TLS_*',
      { MCP_TLS_CERT: '/c.pem', MCP_TLS_KEY: '/k.pem', MCP_TLS_CA: '/ca.pem' },
    ],
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
          CORE_PARAMETERS,
          [],
          { ...env },
          {
            stderr: (line) => lines.push(line),
            exit: (code) => exits.push(code),
          },
          readCoreConfig,
        );
        assert.deepStrictEqual(lines, []);
        assert.deepStrictEqual(exits, []);
        assert.deepStrictEqual(config, readCoreConfig([], {}));
      },
    );
  }

  for (const [key, words] of [
    ['sse', SSE_WORDS],
    ['http', HTTP_WORDS],
  ]) {
    it(format('YAML %s', key), () => {
      assertThrows(
        () => readCoreConfig([], {}, { [key]: { port: 1 } }),
        `${key} (config file): ${words}`,
      );
    });
  }

  it('--allow-destination-header, in each form', () => {
    assertThrows(
      () => readCoreConfig(['--allow-destination-header'], {}),
      '--allow-destination-header is gone: `mcp-abap-adt` serves the destination it is started with',
    );
    assertThrows(
      () => readCoreConfig([], {}, { 'allow-destination-header': true }),
      'allow-destination-header (config file) is gone',
    );
  });

  it("16.0.0's --auth-broker stays refused", () => {
    assertThrows(
      () => readCoreConfig(['--auth-broker'], {}),
      '--auth-broker was removed in 16.0.0 — remove it from the configuration',
    );
    readCoreConfig(['--auth-broker-path=/x'], {});
  });
});

describe('the YAML template and validation come from the table', () => {
  const template = generateYamlConfigTemplate(CORE_PARAMETERS);
  const parsed = load(template) as YamlConfig;

  it('the template is valid and sets only defaults', () => {
    assert.deepStrictEqual(
      validateYamlConfig(CORE_PARAMETERS, parsed).errors,
      [],
    );
    const config = readCoreConfig([], {}, parsed);
    assert.equal(config.mcpDestination, undefined);
  });

  it('holds core rows and no other binary keys', () => {
    assert.deepStrictEqual(
      Object.keys(parsed).sort(),
      [
        'ashost',
        'auth-broker-path',
        'auth-debug',
        'batch',
        'browser',
        'browser-auth-port',
        'browser-program',
        'client',
        'connection-type',
        'deferred-logon',
        'enable-data-tools',
        'env',
        'env-path',
        'group',
        'language',
        'login-timeout',
        'mcp',
        'msserv',
        'mshost',
        'renewal',
        'restore-session',
        'requests',
        'restrictions',
        'saprouter',
        'session-keep-alive-minutes',
        'shutdown-timeout',
        'stdio-message-limit',
        'sysid',
        'sysnr',
        'system-type',
        'unsafe',
      ].sort(),
    );
  });

  it('the validation refuses another binary keys and --transport', () => {
    const { errors } = validateYamlConfig(CORE_PARAMETERS, {
      transport: 'stdio',
      sse: { port: 3001 },
      http: { port: 3000 },
    });
    assert.deepStrictEqual(errors, [
      STDIO_SENTENCE,
      `sse (config file): ${SSE_WORDS}`,
      `http (config file): ${HTTP_WORDS}`,
    ]);
  });

  describe('through --conf', () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-conf-'));
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

    it('a file with another binary key stops the start with its words', async () => {
      const file = path.join(dir, 'conf.yaml');
      fs.writeFileSync(file, 'sse:\n  port: 3001\n');
      const { stderr, exits, served } = await start([`--conf=${file}`]);
      assert.ok(stderr.includes(`sse (config file): ${SSE_WORDS}`));
      assert.deepStrictEqual(exits, [1]);
      assert.equal(served, 0);
    });
  });
});
