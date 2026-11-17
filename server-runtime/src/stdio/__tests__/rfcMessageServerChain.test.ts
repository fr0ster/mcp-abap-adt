/**
 * The stdio chain of an RFC destination's address: launcher settings →
 * `IAuthBrokerFactoryConfig` → the broker factory's `ISapRfcConfig` → the
 * connection born at start, whose `createConnection` is recorded. For each
 * input — the process environment, the destination's `.env` file, the CLI,
 * YAML — what `createConnection` receives carries the message server's five
 * fields (and an application server's two) as given, the client and the
 * language beside them and no URL; an absent optional field stays absent:
 * no key, not `undefined` as a default. An incomplete address is refused
 * before anything is built.
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
import { AuthBrokerFactory } from '../auth/brokerFactory';
import { CORE_PARAMETERS, readCoreConfig } from '../config/coreParameters';
import { launch } from '../launcher.js';
import { StdioServer } from '../StdioServer.js';

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

/** The destination's `.env`, basic over RFC with no address, plus `extra` lines. */
function envFile(extra: string[] = []): string {
  const file = path.join(root, 'dest.env');
  fs.writeFileSync(
    file,
    `${[
      'SAP_CLIENT=100',
      'SAP_LANGUAGE=EN',
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
  expect(config.client).toBe('100');
  expect(config.language).toBe('EN');
  for (const key of ['url', 'ashost', 'sysnr']) {
    expect(Object.hasOwn(config, key)).toBe(false);
  }
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

describe('an absent optional field stays absent (no key, not undefined-as-default)', () => {
  const REQUIRED = [`SAP_MSHOST=${GIVEN.mshost}`, `SAP_GROUP=${GIVEN.group}`];
  it.each([
    ['msserv', [`SAP_SYSID=${GIVEN.sysid}`]],
    ['sysid', [`SAP_MSSERV=${GIVEN.msserv}`]],
    ['saprouter', [`SAP_SYSID=${GIVEN.sysid}`]],
  ] as const)('%s absent', async (absent, service) => {
    const file = envFile([...REQUIRED, ...service]);
    const config = await handedToCreateConnection([`--env-path=${file}`]);
    expect(Object.hasOwn(config, absent)).toBe(false);
    expect(config.mshost).toBe(GIVEN.mshost);
    expect(config.group).toBe(GIVEN.group);
  });
});

describe("an application server's address reaches createConnection as stated", () => {
  it.each([
    [
      "the destination's .env file",
      ['SAP_ASHOST=host.example.test', 'SAP_SYSNR=00'],
      [],
    ],
    ['the CLI', [], ['--ashost=host.example.test', '--sysnr=00']],
  ] as const)('from %s', async (_from, lines, argv) => {
    const file = envFile([...lines]);
    const config = await handedToCreateConnection([
      `--env-path=${file}`,
      ...argv,
    ]);
    expect(config.ashost).toBe('host.example.test');
    expect(config.sysnr).toBe('00');
    for (const key of ['url', 'mshost', 'group']) {
      expect(Object.hasOwn(config, key)).toBe(false);
    }
  });
});

describe('an incomplete address is refused before anything is built', () => {
  it('mshost without msserv and sysid: the start stops naming them, nothing built', async () => {
    const file = envFile([`SAP_MSHOST=${GIVEN.mshost}`, 'SAP_GROUP=SPACE']);
    const { stderr, exits } = await start([`--env-path=${file}`]);
    expect(createConnection).not.toHaveBeenCalled();
    expect(exits).toEqual([1]);
    expect(stderr.join('\n')).toContain(
      'Destination "default" is RFC and its address lacks: SAP_MSSERV or SAP_SYSID',
    );
  });

  it('any other failure of the build is still named by its class only, never its message', async () => {
    (createConnection as unknown as jest.Mock).mockImplementationOnce(() => {
      throw new Error('placeholder words that must not be shown');
    });
    const file = envFile([
      `SAP_MSHOST=${GIVEN.mshost}`,
      'SAP_SYSID=XYZ',
      'SAP_GROUP=SPACE',
    ]);
    const { stderr, exits } = await start([`--env-path=${file}`]);
    expect(exits).toEqual([1]);
    expect(stderr.join('\n')).toContain(
      'could not be connected at start: Error',
    );
    expect(stderr.join('\n')).not.toContain('placeholder words');
  });
});

describe('the start over RFC', () => {
  it('the summary shows the address where HTTP shows the URL', async () => {
    const file = envFile(fields.map((f) => `${FIELDS[f].env}=${GIVEN[f]}`));
    const { stderr } = await start([`--env-path=${file}`]);
    const said = stderr.join('\n');
    expect(said).toContain(`RFC mshost:    ${GIVEN.mshost}`);
    expect(said).toContain(`RFC msserv:    ${GIVEN.msserv}`);
    expect(said).toContain(`RFC sysid:     ${GIVEN.sysid}`);
    expect(said).toContain(`RFC group:     ${GIVEN.group}`);
    expect(said).toContain('RFC saprouter:');
    expect(said).toContain('Language:      EN');
    expect(said).not.toContain('SAP URL:');
  });

  it('no connection type: refused before the settings are read', async () => {
    const file = path.join(root, 'untyped.env');
    fs.writeFileSync(
      file,
      `${['SAP_AUTH_TYPE=basic', 'SAP_USERNAME=u', 'SAP_PASSWORD=p'].join('\n')}\n`,
    );
    const settingsFor = jest.spyOn(AuthBrokerFactory.prototype, 'settingsFor');
    const { stderr, exits } = await start([`--env-path=${file}`]);
    expect(exits).toEqual([1]);
    expect(settingsFor).not.toHaveBeenCalled();
    expect(stderr.join('\n')).toContain('the SAP connection type is required');
  });
});
