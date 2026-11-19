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

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  it,
  type Mock,
  mock,
} from 'node:test';
import { format } from 'node:util';

/** What the start's connection was built with; the build then stops the start. */
class Recorded extends Error {}

import type { IAuthorizationStrategy } from '@mcp-abap-adt/interfaces-auth';
import { readConfigFile } from '@mcp-abap-adt/lib/config';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { connectionCreate as createConnectionModule } from '../../../../src/__tests__/helpers/packageFiles';
import { AuthBrokerFactory } from '../auth/brokerFactory';
import { CORE_PARAMETERS, readCoreConfig } from '../config/coreParameters';
import { launch } from '../launcher.js';
import { StdioServer } from '../StdioServer.js';

/**
 * connection's createConnection, replaced on the module that defines it (the
 * package index re-exports it by getter, read at call time) before each
 * case, since every case restores every mock after it: it records the
 * build and stops the start.
 */
function recordBuilds() {
  return mock.method(
    createConnectionModule,
    'createConnection',
    (_spec: createConnectionModule.ConnectionSpec): never => {
      throw new Recorded('recorded');
    },
  );
}
let create: ReturnType<typeof recordBuilds>;

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
  create = recordBuilds();
  mock.method(StdioServer.prototype, 'start', async () => undefined);
});

afterEach(() => {
  mock.restoreAll();
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
  const calls = create.mock.calls;
  if (calls.length !== 1) {
    throw new Error(
      `createConnection called ${calls.length} times; stderr: ${stderr.join(' | ')}`,
    );
  }
  // The recorded build stopped the start, as any failed connection does.
  assert.deepStrictEqual(exits, [1]);
  const spec = calls[0]?.arguments[0];
  assert.equal(spec?.transport, 'rfc');
  if (spec?.transport !== 'rfc') throw new Error('not an RFC spec');
  return { ...spec.config };
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
    assert.equal(config[field], given[field]);
  }
  assert.equal(config.client, '100');
  assert.equal(config.language, 'EN');
  for (const key of ['url', 'ashost', 'sysnr']) {
    assert.equal(Object.hasOwn(config, key), false);
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
    assert.equal(config.mshost, 'from-cli');
    assert.equal(config.msserv, 'from-env');
    assert.equal(config.sysid, 'FIL');
    assert.equal(config.group, 'FROM_YAML');
    assert.equal(Object.hasOwn(config, 'saprouter'), false);
  });
});

describe('an absent optional field stays absent (no key, not undefined-as-default)', () => {
  const REQUIRED = [`SAP_MSHOST=${GIVEN.mshost}`, `SAP_GROUP=${GIVEN.group}`];
  for (const [absent, service] of [
    ['msserv', [`SAP_SYSID=${GIVEN.sysid}`]],
    ['sysid', [`SAP_MSSERV=${GIVEN.msserv}`]],
    ['saprouter', [`SAP_SYSID=${GIVEN.sysid}`]],
  ] as const) {
    it(format('%s absent', absent), async () => {
      const file = envFile([...REQUIRED, ...service]);
      const config = await handedToCreateConnection([`--env-path=${file}`]);
      assert.equal(Object.hasOwn(config, absent), false);
      assert.equal(config.mshost, GIVEN.mshost);
      assert.equal(config.group, GIVEN.group);
    });
  }
});

describe("an application server's address reaches createConnection as stated", () => {
  for (const [_from, lines, argv] of [
    [
      "the destination's .env file",
      ['SAP_ASHOST=host.example.test', 'SAP_SYSNR=00'],
      [],
    ],
    ['the CLI', [], ['--ashost=host.example.test', '--sysnr=00']],
  ] as const) {
    it(format('from %s', _from), async () => {
      const file = envFile([...lines]);
      const config = await handedToCreateConnection([
        `--env-path=${file}`,
        ...argv,
      ]);
      assert.equal(config.ashost, 'host.example.test');
      assert.equal(config.sysnr, '00');
      for (const key of ['url', 'mshost', 'group']) {
        assert.equal(Object.hasOwn(config, key), false);
      }
    });
  }
});

describe('an incomplete address is refused before anything is built', () => {
  it('mshost without msserv and sysid: the start stops naming them, nothing built', async () => {
    const file = envFile([`SAP_MSHOST=${GIVEN.mshost}`, 'SAP_GROUP=SPACE']);
    const { stderr, exits } = await start([`--env-path=${file}`]);
    assert.equal(create.mock.callCount(), 0);
    assert.deepStrictEqual(exits, [1]);
    assert.ok(
      stderr
        .join('\n')
        .includes(
          'Destination "default" is RFC and its address lacks: SAP_MSSERV or SAP_SYSID',
        ),
    );
  });

  it('any other failure of the build is still named by its class only, never its message', async () => {
    create.mock.mockImplementationOnce(() => {
      throw new Error('placeholder words that must not be shown');
    });
    const file = envFile([
      `SAP_MSHOST=${GIVEN.mshost}`,
      'SAP_SYSID=XYZ',
      'SAP_GROUP=SPACE',
    ]);
    const { stderr, exits } = await start([`--env-path=${file}`]);
    assert.deepStrictEqual(exits, [1]);
    assert.ok(
      stderr.join('\n').includes('could not be connected at start: Error'),
    );
    assert.ok(!stderr.join('\n').includes('placeholder words'));
  });
});

describe('the start over RFC', () => {
  it('the summary shows the address where HTTP shows the URL', async () => {
    const file = envFile(fields.map((f) => `${FIELDS[f].env}=${GIVEN[f]}`));
    const { stderr } = await start([`--env-path=${file}`]);
    const said = stderr.join('\n');
    assert.ok(said.includes(`RFC mshost:    ${GIVEN.mshost}`));
    assert.ok(said.includes(`RFC msserv:    ${GIVEN.msserv}`));
    assert.ok(said.includes(`RFC sysid:     ${GIVEN.sysid}`));
    assert.ok(said.includes(`RFC group:     ${GIVEN.group}`));
    assert.ok(said.includes('RFC saprouter:'));
    assert.ok(said.includes('Language:      EN'));
    assert.ok(!said.includes('SAP URL:'));
  });

  it('no connection type: refused before the settings are read', async (t) => {
    const file = path.join(root, 'untyped.env');
    fs.writeFileSync(
      file,
      `${['SAP_AUTH_TYPE=basic', 'SAP_USERNAME=u', 'SAP_PASSWORD=p'].join('\n')}\n`,
    );
    const settingsFor = t.mock.method(
      AuthBrokerFactory.prototype,
      'settingsFor',
    );
    const { stderr, exits } = await start([`--env-path=${file}`]);
    assert.deepStrictEqual(exits, [1]);
    assert.equal(settingsFor.mock.callCount(), 0);
    assert.ok(
      stderr.join('\n').includes('the SAP connection type is required'),
    );
  });
});
