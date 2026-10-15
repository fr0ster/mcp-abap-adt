/**
 * `mcp-abap-adt`'s own parameter table: its
 * help lists no HTTP or SSE option, every option of another binary and
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
import { CORE_PARAMETERS, readCoreConfig } from '../../config/coreParameters';
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
  jest.restoreAllMocks();
  process.argv = savedArgv;
  process.env = savedEnv;
});

/** Runs the program's `main` with `argv`; the start is expected to stop. */
async function start(argv: string[], env: NodeJS.ProcessEnv = {}) {
  process.argv = ['node', 'mcp-abap-adt', ...argv];
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
    .spyOn(StdioServer.prototype, 'start')
    .mockResolvedValue(undefined);
  // The connection at start is the launcher's own step: not made here.
  jest
    .spyOn(StdioServer.prototype, 'connectAtStart')
    .mockResolvedValue({ session: 'logged_on' });
  await main({
    toolSet: fullToolSet,
    program: 'mcp-abap-adt',
    version: '0.0.0-test',
  });
  return {
    stderr: written.join(''),
    exits,
    served: served.mock.calls.length,
  };
}

describe("core's help", () => {
  const help = coreHelp();

  it.each([
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
  ])('lists no %s', (name) => {
    expect(help).not.toContain(name);
  });

  it.each([
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
    '--state-idle-minutes',
    'MCP_STATE_IDLE_MINUTES',
    '--shutdown-timeout',
    'MCP_SHUTDOWN_TIMEOUT',
    'SAP_DEBUG_TERMINAL_ID',
    'SAP_DEBUG_IDE_ID',
  ])('lists %s', (name) => {
    expect(help).toContain(name);
  });

  it("names the debugger ids' sources: the destination's .env, then the environment", () => {
    const block = help.slice(help.indexOf('SAP_DEBUG_TERMINAL_ID'));
    expect(block.replace(/\s+/g, ' ')).toContain(
      "First found: the destination's .env; the environment.",
    );
  });
});

describe('--shutdown-timeout is a row of core', () => {
  it('no default: absent unless given', () => {
    expect(readCoreConfig([], {}).shutdownTimeout).toBeUndefined();
  });

  it('CLI, env and YAML reach the config, in seconds', () => {
    expect(readCoreConfig(['--shutdown-timeout=5'], {}).shutdownTimeout).toBe(
      5,
    );
    expect(
      readCoreConfig([], { MCP_SHUTDOWN_TIMEOUT: '7' }).shutdownTimeout,
    ).toBe(7);
    expect(
      readCoreConfig([], {}, { 'shutdown-timeout': 9 }).shutdownTimeout,
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

describe('--state-idle-minutes is a row of core', () => {
  it("29 stops the start with main's words", async () => {
    const { stderr, exits, served } = await start(['--state-idle-minutes=29']);
    expect(stderr).toContain(
      'Invalid --state-idle-minutes: "29". Must be a whole number of minutes, at least 30',
    );
    expect(exits).toEqual([1]);
    expect(served).toBe(0);
  });

  it('CLI, env and YAML reach the config; 30 by default', () => {
    expect(readCoreConfig([], {}).stateIdleMinutes).toBe(30);
    expect(
      readCoreConfig(['--state-idle-minutes=45'], {}).stateIdleMinutes,
    ).toBe(45);
    expect(
      readCoreConfig([], { MCP_STATE_IDLE_MINUTES: '40' }).stateIdleMinutes,
    ).toBe(40);
    expect(
      readCoreConfig([], {}, { 'state-idle-minutes': 35 }).stateIdleMinutes,
    ).toBe(35);
  });
});

// The binary fixes its tool set: the flag and the YAML key are gone,
// each word answered with the binary of this transport that serves it.
describe('--exposition is gone', () => {
  it('the flag stops the start, naming the binary its words ask for', () => {
    expect(() => readCoreConfig(['--exposition=readonly'], {})).toThrow(
      new ParameterRefusal(
        '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the readonly tools alone (with system and search) are served by `mcp-abap-adt-ro` (`@mcp-abap-adt/core-ro`)',
      ),
    );
    expect(() =>
      readCoreConfig(['--exposition', 'readonly,high,debug'], {}),
    ).toThrow(
      new ParameterRefusal(
        '--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the high tools are served, beside the readonly ones, by `mcp-abap-adt` (`@mcp-abap-adt/core`)',
      ),
    );
  });

  it('in the config file too, and the help lists no such option', () => {
    expect(() => readCoreConfig([], {}, { exposition: 'readonly' })).toThrow(
      new ParameterRefusal(
        'exposition (config file) is gone (19.0.0): the binary fixes its tool set, so remove it; the readonly tools alone (with system and search) are served by `mcp-abap-adt-ro` (`@mcp-abap-adt/core-ro`)',
      ),
    );
  });
});

describe('--transport, with any value, stops the start with the sentence of the binary that serves it', () => {
  it.each([
    [['--transport=stdio'], {}],
    [['--transport=http'], {}],
    [['--transport=sse'], {}],
    [['--transport', 'stdio'], {}],
    [[], { MCP_TRANSPORT: 'stdio' }],
  ] as const)('%j %j', async (argv, env) => {
    const { stderr, exits, served } = await start([...argv], { ...env });
    expect(stderr).toBe(`[MCP] ${STDIO_SENTENCE}\n`);
    expect(exits).toEqual([1]);
    expect(served).toBe(0);
  });

  it('in the config file too', () => {
    expect(() => readCoreConfig([], {}, { transport: 'stdio' })).toThrow(
      STDIO_SENTENCE,
    );
  });
});

describe('every removed parameter stops core with its words', () => {
  it.each([
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
  ] as const)(
    "another binary's %s is not read: the start proceeds and the value is not used",
    (_family, env) => {
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
      expect(lines).toEqual([]);
      expect(exits).toEqual([]);
      expect(config).toEqual(readCoreConfig([], {}));
    },
  );

  it.each([
    ['sse', SSE_WORDS],
    ['http', HTTP_WORDS],
  ])('YAML %s', (key, words) => {
    expect(() => readCoreConfig([], {}, { [key]: { port: 1 } })).toThrow(
      `${key} (config file): ${words}`,
    );
  });

  it('--allow-destination-header, in each form', () => {
    expect(() => readCoreConfig(['--allow-destination-header'], {})).toThrow(
      '--allow-destination-header is gone: `mcp-abap-adt` serves the destination it is started with',
    );
    expect(() =>
      readCoreConfig([], {}, { 'allow-destination-header': true }),
    ).toThrow('allow-destination-header (config file) is gone');
  });

  it("16.0.0's --auth-broker stays refused", () => {
    expect(() => readCoreConfig(['--auth-broker'], {})).toThrow(
      '--auth-broker was removed in 16.0.0 — remove it from the configuration',
    );
    expect(() => readCoreConfig(['--auth-broker-path=/x'], {})).not.toThrow();
  });
});

describe('the YAML template and validation come from the table', () => {
  const template = generateYamlConfigTemplate(CORE_PARAMETERS);
  const parsed = load(template) as Record<string, unknown>;

  it('the template is valid and sets only defaults', () => {
    expect(validateYamlConfig(CORE_PARAMETERS, parsed).errors).toEqual([]);
    const config = readCoreConfig([], {}, parsed);
    expect(config.stateIdleMinutes).toBe(30);
    expect(config.mcpDestination).toBeUndefined();
  });

  it('holds core rows and no other binary keys', () => {
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'auth-broker-path',
        'auth-debug',
        'browser',
        'browser-auth-port',
        'browser-program',
        'connection-type',
        'env',
        'env-path',
        'login-timeout',
        'mcp',
        'renewal',
        'shutdown-timeout',
        'state-idle-minutes',
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
    expect(errors).toEqual([
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
      expect(exits).toEqual([0]);
      expect(served).toBe(0);
      expect(fs.readFileSync(file, 'utf8')).toBe(template);
    });

    it('a file with another binary key stops the start with its words', async () => {
      const file = path.join(dir, 'conf.yaml');
      fs.writeFileSync(file, 'sse:\n  port: 3001\n');
      const { stderr, exits, served } = await start([`--conf=${file}`]);
      expect(stderr).toContain(`sse (config file): ${SSE_WORDS}`);
      expect(exits).toEqual([1]);
      expect(served).toBe(0);
    });
  });
});
