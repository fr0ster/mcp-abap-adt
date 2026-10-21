/**
 * Only the chain's own session format. auth-stores 5 refuses a session
 * record that is not of its store's format — `StorageError`, `reason:
 * 'record-format'` — and the broker passes it on unchanged. core answers it
 * in its own fixed words with the destination it serves: the start
 * stops, and a tool call answers `destination_refused` — never a new
 * login, never "no session", never the store's message or a value of the
 * record. The file is left byte for byte.
 *
 * Each case is a real stdio start on auth-stores 5 and the broker, over an
 * `--env` file and over a named destination with `--unsafe`, against a token
 * endpoint and an ADT stand-in that must see nothing.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  type AdtStandIn,
  adtStandIn,
} from '../../../../src/__tests__/helpers/adtStandIn';
import { AuthBrokerFactory } from '../../auth/brokerFactory';
import { RECORD_FORMAT_HINT } from '../../auth/destinationFailure';
import { readCoreConfig } from '../../config/coreParameters';
import { launch } from '../../launcher';
import { StdioServer } from '../../StdioServer';
import {
  type BrokerBase,
  brokerBase,
  factoryConfig,
  recordingLogins,
} from '../helpers/factoryFixture';

/** The launcher's options as `mcp-abap-adt` passes them. */
const TEST_OPTIONS = {
  toolSet: fullToolSet,
  program: 'mcp-abap-adt',
  version: '0.0.0-test',
};

const TOKEN = 'record-token-PLACEHOLDER.payload.signature';
const REFRESH = 'record-refresh-PLACEHOLDER';

const savedArgv = process.argv;
const savedEnv = { ...process.env };
const savedCwd = process.cwd();

let base: BrokerBase;
let adt: AdtStandIn;
let uaa: AdtStandIn;

beforeEach(async () => {
  base = brokerBase('record-format');
  process.chdir(base.root);
  for (const name of [
    'MCP_BROWSER',
    'MCP_BROWSER_PROGRAM',
    'MCP_RENEWAL',
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
  adt = await adtStandIn();
  uaa = await adtStandIn();
});

afterEach(async () => {
  jest.restoreAllMocks();
  process.argv = savedArgv;
  process.env = { ...savedEnv };
  process.chdir(savedCwd);
  base.remove();
  await adt.close();
  await uaa.close();
});

/** A jwt / authorization_code destination's means: the system and a client at the UAA stand-in. */
const means = () => [
  `SAP_URL=${adt.url}`,
  'SAP_CLIENT=100',
  'SAP_AUTH_TYPE=jwt',
  'SAP_GRANT_TYPE=authorization_code',
  `SAP_UAA_URL=${uaa.url}`,
  'SAP_UAA_CLIENT_ID=client-id-PLACEHOLDER',
  'SAP_UAA_CLIENT_SECRET=client-secret-PLACEHOLDER',
];

/** Records the session store refuses, each with the token in it. */
const MALFORMED: ReadonlyArray<readonly [string, () => string[]]> = [
  [
    'a token with no SAP_ISSUED_* beside it',
    () => [
      ...means(),
      `SAP_JWT_TOKEN=${TOKEN}`,
      `SAP_REFRESH_TOKEN=${REFRESH}`,
    ],
  ],
  [
    'a token and cookies both',
    () => [
      ...means(),
      `SAP_JWT_TOKEN=${TOKEN}`,
      `SAP_SESSION_COOKIES_B64=${Buffer.from('MYSAPSSO2=cookie-PLACEHOLDER').toString('base64')}`,
      `SAP_ISSUED_FOR=${adt.url}`,
      'SAP_ISSUED_BY=issuer-PLACEHOLDER',
    ],
  ],
  [
    'a non-integer expiry',
    () => [
      ...means(),
      `SAP_JWT_TOKEN=${TOKEN}`,
      'SAP_EXPIRES_AT=tomorrow-PLACEHOLDER',
      `SAP_ISSUED_FOR=${adt.url}`,
      'SAP_ISSUED_BY=issuer-PLACEHOLDER',
    ],
  ],
];

/** The two ways a file reaches the store: the --env file, or a named destination with --unsafe. */
const MODES = [
  {
    mode: '--env-path',
    name: 'default',
    write: (lines: string[]) => base.writeFile('conn.env', lines),
    argv: (file: string) => [`--env-path=${file}`],
    factory: (file: string) => ({
      envFile: { path: file, source: '--env-path' },
    }),
  },
  {
    mode: '--mcp with --unsafe',
    name: 'DEST',
    write: (lines: string[]) => {
      base.writeSession('DEST', lines);
      return path.join(base.sessionsDir, 'DEST.env');
    },
    argv: () => ['--mcp=DEST', `--auth-broker-path=${base.root}`, '--unsafe'],
    factory: () => ({ mcpDestination: 'DEST', unsafe: true }),
  },
] as const;

const refusal = (name: string) =>
  `Destination "${name}" cannot be used: its session record is not in the store's format`;

/** Neither a value of the record nor the store's own words. */
function expectClean(text: string): void {
  for (const value of [
    'PLACEHOLDER',
    "this store's format",
    'SessionStore',
    'regenerate it with mcp-auth;',
  ]) {
    expect(text).not.toContain(value);
  }
}

async function start(argv: string[]) {
  process.argv = ['node', 'mcp-abap-adt', ...argv];
  const config = readCoreConfig(process.argv.slice(2), process.env);
  const logins = recordingLogins();
  const stderr: string[] = [];
  const exits: number[] = [];
  const stdioStart = jest
    .spyOn(StdioServer.prototype, 'start')
    .mockResolvedValue(undefined);
  // The connection at start is the launcher's own step: not made here.
  jest
    .spyOn(StdioServer.prototype, 'connectAtStart')
    .mockResolvedValue({ session: 'logged_on' });
  await launch(config, TEST_OPTIONS, {
    browserStrategy: logins.browserStrategy,
    stderr: (line) => stderr.push(line),
    exit: (code) => exits.push(code),
    processLike: Object.assign(new EventEmitter(), {
      stdin: new EventEmitter(),
    }),
    platform: 'linux',
  });
  const started = stdioStart.mock.calls.length;
  stdioStart.mockRestore();
  return { stderr, exits, logins, started };
}

/** One tool call through core's StdioServer on the factory: its answer and the logins it started. */
async function toolCall(name: string, over: object) {
  const logins = recordingLogins();
  const factory = new AuthBrokerFactory(
    factoryConfig(base, logins, over as never),
  );
  const reached = jest.fn();
  const group = {
    getName: () => 'stub',
    getHandlers: () => [
      {
        toolDefinition: {
          name: 'StubTool',
          description: 'a tool',
          inputSchema: { type: 'object', properties: {} },
        },
        handler: async (_context: unknown, _args: unknown) => {
          reached();
          return { content: [{ type: 'text', text: 'read' }] };
        },
      },
    ],
    registerHandlers: () => {},
  };
  const server = new StdioServer(
    new CompositeHandlersRegistry([group as never]),
    factory,
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'record-format', version: '1.0.0' });
  await Promise.all([
    server.start(name, serverSide),
    client.connect(clientSide),
  ]);
  try {
    const result = (await client.callTool({
      name: 'StubTool',
      arguments: {},
    })) as { isError?: boolean; content: Array<{ text: string }> };
    return { result, reached, logins };
  } finally {
    await client.close();
  }
}

describe.each(MODES)('a record not of the store’s format ($mode)', (mode) => {
  it.each(MALFORMED)(
    '%s: the start stops, a tool call answers destination_refused, nothing sent, the file unchanged',
    async (_label, lines) => {
      const file = mode.write(lines());
      const before = fs.readFileSync(file);
      const errorLines: string[] = [];
      const stderrSpy = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation((chunk: unknown) => {
          errorLines.push(String(chunk));
          return true;
        });
      try {
        // The start.
        const run = await start(mode.argv(file));
        expect(run.exits).toEqual([1]);
        expect(run.started).toBe(0);
        expect(run.stderr).toEqual([
          `[MCP] ${refusal(mode.name)}\n${RECORD_FORMAT_HINT}`,
        ]);
        expect(run.logins.requests).toEqual([]);

        // A request on core's server.
        const { result, reached, logins } = await toolCall(
          mode.name,
          mode.factory(file),
        );
        expect(result.isError).toBe(true);
        const text = result.content[0].text;
        expect(JSON.parse(text)).toEqual({
          error: 'destination_refused',
          message: refusal(mode.name),
          hint: RECORD_FORMAT_HINT,
        });
        expect(reached).not.toHaveBeenCalled();
        expect(logins.requests).toEqual([]);

        // Nothing reached the system or the token endpoint; the file is as it was.
        expect(adt.requests).toEqual([]);
        expect(uaa.requests).toEqual([]);
        expect(fs.readFileSync(file).equals(before)).toBe(true);
        for (const line of [...run.stderr, text, ...errorLines]) {
          expectClean(line);
        }
      } finally {
        stderrSpy.mockRestore();
      }
    },
  );

  it('the means and no token or cookies: no session — the destination logs in through the browser', async () => {
    const file = mode.write([...means(), 'SAP_ISSUED_FOR=', 'SAP_ISSUED_BY=']);
    const run = await start(mode.argv(file));
    expect(run.exits).toEqual([]);
    expect(run.started).toBe(1);

    const { logins } = await toolCall(mode.name, mode.factory(file));
    // The login started (the fake browser's strategy was asked).
    expect(logins.requests).toHaveLength(1);
  });
});

it('the hint, verbatim', () => {
  expect(RECORD_FORMAT_HINT).toBe(
    'regenerate the session with mcp-auth: `mcp-auth --destination <name> --type abap|xsuaa`, or `mcp-auth --service-key <file> --output <file> --type abap|xsuaa` (from @mcp-abap-adt/auth-broker-cli)',
  );
});
