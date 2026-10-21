/**
 * The stdio chain of the message server's fields: launcher settings →
 * `IAuthBrokerFactoryConfig` → the broker factory's `SapConfig` → the
 * connection born at start, whose `createConnection` is recorded. For each
 * input — the process environment, the destination's `.env` file, the CLI,
 * YAML — what `createConnection` receives carries the five fields as given;
 * an absent field stays absent: no key, not `undefined` as a default.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** What the start's connection was built with; the build then stops the start. */
class Recorded extends Error {}

jest.mock('@mcp-abap-adt/connection', () => {
  const actual = jest.requireActual('@mcp-abap-adt/connection');
  return {
    ...actual,
    createConnection: jest.fn(() => {
      throw new Recorded('recorded');
    }),
  };
});

import { createConnection } from '@mcp-abap-adt/connection';
import type { IAuthorizationStrategy } from '@mcp-abap-adt/interfaces-auth';
import { readConfigFile } from '@mcp-abap-adt/lib/config';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { CORE_PARAMETERS, readCoreConfig } from '../config/coreParameters';
import { launch } from '../launcher.js';
import { StdioServer } from '../StdioServer.js';

const SYSTEM_URL = 'https://system.example.test';

const FIELDS = {
  mshost: { cli: '--mshost', env: 'SAP_MSHOST', yaml: 'mshost' },
  msserv: { cli: '--msserv', env: 'SAP_MSSERV', yaml: 'msserv' },
  sysid: { cli: '--sysid', env: 'SAP_SYSID', yaml: 'sysid' },
  group: { cli: '--group', env: 'SAP_GROUP', yaml: 'group' },
  saprouter: { cli: '--saprouter', env: 'SAP_SAPROUTER', yaml: 'saprouter' },
} as const;
type Field = keyof typeof FIELDS;

const GIVEN: Record<Field, string> = {
  mshost: 'ms.example.test',
  msserv: 'sapmsXYZ',
  sysid: 'XYZ',
  group: 'SPACE',
  saprouter: '/H/router.example.test/S/3299/H/',
};

const savedArgv = process.argv;
const savedEnv = { ...process.env };
const savedCwd = process.cwd();
let root: string;

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'rfc-message-server-')),
  );
  process.chdir(root);
  for (const name of Object.keys(process.env)) {
    if (name.startsWith('SAP_') || name.startsWith('MCP_')) {
      delete process.env[name];
    }
  }
  delete process.env.AUTH_BROKER_PATH;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  (createConnection as unknown as jest.Mock).mockClear();
  jest.spyOn(StdioServer.prototype, 'start').mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  process.argv = savedArgv;
  process.env = { ...savedEnv };
  process.chdir(savedCwd);
  fs.rmSync(root, { recursive: true, force: true });
});

const noLogin = (): IAuthorizationStrategy<string> => ({
  authorize: async () => {
    throw new Error('no login in this test');
  },
});

/** The destination's `.env`, basic over RFC, plus `extra` lines. */
function envFile(extra: string[] = []): string {
  const file = path.join(root, 'dest.env');
  fs.writeFileSync(
    file,
    `${[
      `SAP_URL=${SYSTEM_URL}`,
      'SAP_CLIENT=100',
      'SAP_AUTH_TYPE=basic',
      'SAP_USERNAME=placeholder-user',
      'SAP_PASSWORD=placeholder-password-long',
      'SAP_CONNECTION_TYPE=rfc',
      ...extra,
    ].join('\n')}\n`,
  );
  return file;
}

/**
 * Parses `argv` as the program does and launches with stand-in edges; the
 * connection at start runs for real up to `createConnection`. Answers the
 * config it received.
 */
async function handedToCreateConnection(
  argv: string[],
): Promise<Record<string, unknown>> {
  const { stderr, exits } = await start(argv);
  const calls = (createConnection as unknown as jest.Mock).mock.calls;
  if (calls.length !== 1) {
    throw new Error(
      `createConnection called ${calls.length} times; stderr: ${stderr.join(' | ')}`,
    );
  }
  // The recorded build stopped the start, as any failed connection does.
  expect(exits).toEqual([1]);
  const spec = calls[0][0] as {
    config: Record<string, unknown>;
    transport: string;
  };
  expect(spec.transport).toBe('rfc');
  return spec.config;
}

/** Parses `argv` as the program does and launches with stand-in edges. */
async function start(
  argv: string[],
): Promise<{ stderr: string[]; exits: number[] }> {
  process.argv = ['node', 'mcp-abap-adt', ...argv];
  const args = process.argv.slice(2);
  const file = readConfigFile(CORE_PARAMETERS, args);
  const config = readCoreConfig(
    args,
    process.env,
    file.template ? null : file.yaml,
  );
  const stderr: string[] = [];
  const exits: number[] = [];
  await launch(
    config,
    {
      toolSet: fullToolSet,
      program: 'mcp-abap-adt',
      version: '0.0.0-test',
      packageName: '@mcp-abap-adt/core',
    },
    {
      browserStrategy: noLogin,
      stderr: (line) => stderr.push(line),
      exit: (code) => exits.push(code),
      processLike: Object.assign(new EventEmitter(), {
        stdin: new EventEmitter(),
      }),
      platform: 'linux',
    },
  );
  return { stderr, exits };
}

function expectAll(config: Record<string, unknown>, given = GIVEN): void {
  for (const field of Object.keys(FIELDS) as Field[]) {
    expect(config[field]).toBe(given[field]);
  }
  expect(config.url).toBe(SYSTEM_URL);
}

const fields = Object.keys(FIELDS) as Field[];

describe('the settings handed to createConnection carry the five fields as given', () => {
  it('from the process environment', async () => {
    for (const f of fields) process.env[FIELDS[f].env] = GIVEN[f];
    expectAll(await handedToCreateConnection([`--env-path=${envFile()}`]));
  });

  it("from the destination's .env file", async () => {
    const file = envFile(fields.map((f) => `${FIELDS[f].env}=${GIVEN[f]}`));
    expectAll(await handedToCreateConnection([`--env-path=${file}`]));
  });

  it('from the CLI', async () => {
    expectAll(
      await handedToCreateConnection([
        `--env-path=${envFile()}`,
        ...fields.map((f) => `${FIELDS[f].cli}=${GIVEN[f]}`),
      ]),
    );
  });

  it('from YAML', async () => {
    const yamlFile = path.join(root, 'config.yaml');
    fs.writeFileSync(
      yamlFile,
      fields
        .map((f) => `${FIELDS[f].yaml}: ${JSON.stringify(GIVEN[f])}\n`)
        .join(''),
    );
    expectAll(
      await handedToCreateConnection([
        `--env-path=${envFile()}`,
        `--config=${yamlFile}`,
      ]),
    );
  });

  it('precedence as the connection type: CLI, then the environment, then the file, then YAML', async () => {
    const yamlFile = path.join(root, 'config.yaml');
    fs.writeFileSync(
      yamlFile,
      'mshost: from-yaml\nmsserv: from-yaml\nsysid: YML\ngroup: FROM_YAML\n',
    );
    process.env.SAP_MSSERV = 'from-env';
    const file = envFile([
      'SAP_MSHOST=from-file',
      'SAP_SYSID=FIL',
      'SAP_MSSERV=from-file',
    ]);
    const config = await handedToCreateConnection([
      `--env-path=${file}`,
      `--config=${yamlFile}`,
      '--mshost=from-cli',
    ]);
    expect(config.mshost).toBe('from-cli');
    expect(config.msserv).toBe('from-env');
    expect(config.sysid).toBe('FIL');
    expect(config.group).toBe('FROM_YAML');
    expect(Object.hasOwn(config, 'saprouter')).toBe(false);
  });
});

describe('an absent field stays absent (no key, not undefined-as-default)', () => {
  it.each(fields)('%s absent, the others given', async (absent) => {
    const given = fields.filter((f) => f !== absent);
    // A message server needs msserv or sysid: both absent never happens here.
    const file = envFile(given.map((f) => `${FIELDS[f].env}=${GIVEN[f]}`));
    const config = await handedToCreateConnection([`--env-path=${file}`]);
    expect(Object.hasOwn(config, absent)).toBe(false);
    for (const f of given) expect(config[f]).toBe(GIVEN[f]);
  });

  it('none given: no key of them', async () => {
    const config = await handedToCreateConnection([`--env-path=${envFile()}`]);
    for (const f of fields) expect(Object.hasOwn(config, f)).toBe(false);
  });
});

describe("mshost without msserv and sysid: connection's refusal reaches the start's caller as it came", () => {
  it('the start stops with connection’s own words, naming msserv and sysid', async () => {
    const actual = jest.requireActual('@mcp-abap-adt/connection');
    // connection's own words for this config, read from connection itself.
    let words = '';
    try {
      actual.rfcParamsFrom({ url: SYSTEM_URL, mshost: GIVEN.mshost });
    } catch (error) {
      words = (error as Error).message;
    }
    expect(words).toContain('msserv');
    expect(words).toContain('sysid');

    // This start's build is connection's real one.
    (createConnection as unknown as jest.Mock).mockImplementationOnce(
      (spec: unknown) => actual.createConnection(spec),
    );
    const file = envFile([`SAP_MSHOST=${GIVEN.mshost}`, 'SAP_GROUP=SPACE']);
    const { stderr, exits } = await start([`--env-path=${file}`]);

    expect(createConnection).toHaveBeenCalledTimes(1);
    expect(exits).toEqual([1]);
    expect(stderr.join('\n')).toContain(words);
  });

  it('any other failure of the build is still named by its class only, never its message', async () => {
    (createConnection as unknown as jest.Mock).mockImplementationOnce(() => {
      throw new Error('placeholder words that must not be shown');
    });
    const file = envFile([`SAP_MSHOST=${GIVEN.mshost}`, 'SAP_SYSID=XYZ']);
    const { stderr, exits } = await start([`--env-path=${file}`]);
    expect(exits).toEqual([1]);
    expect(stderr.join('\n')).toContain(
      'could not be connected at start: Error',
    );
    expect(stderr.join('\n')).not.toContain('placeholder words');
  });
});
