/**
 * stdio: the connection is born at the process's start, before the MCP
 * transport opens — the launcher has the system, the user and the
 * connection parameters then. The destination's one leftover session is
 * taken up; none, or several, is a normal logon (several are left for the
 * list and the logoff). Any failure — the logon, the resume, a cloud
 * system's information — ends the process with exit 1 and the failure's
 * words on stderr, and the transport never opens. A tool afterwards runs on
 * the connection born at the start; no binary lists a resume tool (the
 * compact sets: `toolSet.test.ts`).
 *
 * The whole launcher, against the ADT stand-in; the destination an env file
 * (`default`), its runtime files under `--auth-broker-path`.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runtimeDirectory } from '@mcp-abap-adt/lib/embeddable';
import {
  fullReadOnlyToolSet,
  fullToolSet,
  type ToolSet,
} from '@mcp-abap-adt/lib/tool-set';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  type AdtStandIn,
  adtStandIn,
  type StandInRequest,
} from '../../../src/__tests__/helpers/adtStandIn';
import {
  killedProcessSession,
  runtimeFiles,
} from '../../../src/__tests__/helpers/leftoverSession';
import { resetProcessLatchForTests } from '../../../src/lib/activeTools';
import { readCoreConfig } from '../config/coreParameters';
import {
  launch,
  startLookupFailedWords,
  startSystemWithoutUserWords,
} from '../launcher.js';

jest.setTimeout(30_000);

const USER = 'START_USER';
const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');

let root: string;
let runtime: string;
let envFile: string;
let standIn: AdtStandIn;
const savedEnv = { ...process.env };

beforeEach(async () => {
  resetProcessLatchForTests();
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'start-')));
  runtime = runtimeDirectory(root);
  standIn = await adtStandIn();
  envFile = path.join(root, 'start.env');
  fs.writeFileSync(
    envFile,
    [
      `SAP_URL=${standIn.url}`,
      'SAP_CLIENT=100',
      'SAP_AUTH_TYPE=basic',
      `SAP_USERNAME=${USER}`,
      'SAP_PASSWORD=start-password',
      '',
    ].join('\n'),
  );
  for (const name of [
    'SAP_SYSTEM_TYPE',
    'SAP_CONNECTION_TYPE',
    'MCP_ENV_PATH',
  ]) {
    delete process.env[name];
  }
});

afterEach(async () => {
  await standIn.close();
  fs.rmSync(root, { recursive: true, force: true });
  process.env = { ...savedEnv };
  jest.restoreAllMocks();
});

/** A session a killed process left for this destination, on `kind`. */
async function leftover(kind: 'onprem' | 'cloud' = 'onprem') {
  process.env.SAP_SYSTEM_TYPE = kind;
  const handle = await killedProcessSession(standIn.url, runtime, {
    user: USER,
    destination: 'default',
  });
  const session = standIn.requests.at(-1)?.session ?? '';
  return { handle, session };
}

/** Launches `mcp-abap-adt` (or `toolSet`) over an in-memory transport. */
async function start(
  options: { kind?: 'onprem' | 'cloud'; toolSet?: ToolSet } = {},
) {
  const args = [
    `--env-path=${envFile}`,
    `--auth-broker-path=${root}`,
    `--system-type=${options.kind ?? 'onprem'}`,
  ];
  const config = readCoreConfig(args, process.env, null);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  let opened = 0;
  const open = serverSide.start.bind(serverSide);
  serverSide.start = async () => {
    opened += 1;
    // What SAP had seen when the transport opened.
    seenAtOpen = standIn.requests.length;
    return open();
  };
  let seenAtOpen = -1;
  const stderr: string[] = [];
  const exits: number[] = [];
  const processLike = Object.assign(new EventEmitter(), {
    stdin: new EventEmitter(),
  });
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  await launch(
    config,
    {
      toolSet: options.toolSet ?? fullToolSet,
      program: 'mcp-abap-adt',
      version: '0.0.0-test',
    },
    {
      browserStrategy: (() => {
        throw new Error('no login in this test');
      }) as never,
      stderr: (line) => stderr.push(line),
      exit: (code) => exits.push(code),
      processLike,
      platform: 'linux',
      transport: serverSide,
    },
  );
  const client = new Client({ name: 'start', version: '1.0.0' });
  const connected = opened > 0;
  if (connected) await client.connect(clientSide);
  return {
    stderr,
    exits,
    opened: () => opened,
    seenAtOpen: () => seenAtOpen,
    client,
    call: async (name: string, args: Record<string, unknown> = {}) => {
      const answer = (await client.callTool({ name, arguments: args })) as {
        isError?: boolean;
        content: Array<{ text: string }>;
      };
      return { text: answer.content[0]?.text ?? '', isError: !!answer.isError };
    },
    /** The shutdown, as the end of stdin starts it. */
    stop: async () => {
      if (connected) await client.close().catch(() => undefined);
      processLike.stdin.emit('end');
      const end = Date.now() + 10_000;
      while (exits.length === 0 && Date.now() < end) {
        await new Promise((r) => setTimeout(r, 5));
      }
    },
  };
}

it('one leftover session: picked up before the transport opens, with no tool call; a tool afterwards runs in it with no logon', async () => {
  const { handle, session } = await leftover();
  const from = standIn.requests.length;
  const s = await start();
  try {
    expect(s.exits).toEqual([]);
    expect(s.opened()).toBe(1);
    // Everything up to the transport's opening was the resume, in the old
    // session, without the credential.
    const born = standIn.requests.slice(from, s.seenAtOpen());
    expect(born.length).toBeGreaterThan(0);
    for (const r of born) {
      expect(r.session).toBe(session);
      expect(r.authorization).toBeUndefined();
    }
    expect(runtimeFiles(runtime)).toEqual([handle]);
    const file = JSON.parse(
      fs.readFileSync(path.join(runtime, handle), 'utf8'),
    );
    expect(file.pid).toBe(process.pid);

    const before = standIn.requests.length;
    expect((await s.call('ListLeftoverSessions')).text).toContain(
      '"sessions": []',
    );
    expect(standIn.requests.length).toBe(before);
    const read = await s.call('GetClass', { class_name: 'ZCL_AFTER_START' });
    expect(read.text).not.toContain('not found');
    expect(
      new Set(standIn.requests.slice(before).map((r) => r.session)),
    ).toEqual(new Set([session]));
  } finally {
    await s.stop();
  }
});

it('one leftover session SAP says has ended (401): a new session logged on at the start, the file under the same handle', async () => {
  const { handle, session } = await leftover();
  standIn.answer((r) => r.session === session, 401);
  const from = standIn.requests.length;
  const s = await start();
  try {
    expect(s.exits).toEqual([]);
    const born = standIn.requests.slice(from, s.seenAtOpen());
    const fresh = new Set(
      born.filter((r) => r.session !== session).map((r) => r.session),
    );
    expect(fresh.size).toBe(1);
    expect(runtimeFiles(runtime)).toEqual([handle]);
  } finally {
    await s.stop();
  }
});

it('none: a normal logon at the start, before the transport opens', async () => {
  const s = await start();
  try {
    expect(s.exits).toEqual([]);
    const born = standIn.requests.slice(0, s.seenAtOpen());
    expect(born.some((r) => r.authorization !== undefined)).toBe(true);
    expect(new Set(born.map((r) => r.session)).size).toBe(1);
    expect(runtimeFiles(runtime)).toHaveLength(1);
  } finally {
    await s.stop();
  }
});

it('two: a normal logon, and both files are left untouched', async () => {
  const first = await leftover();
  const second = await leftover();
  const read = (handle: string) =>
    fs.readFileSync(path.join(runtime, handle), 'utf8');
  const before = { first: read(first.handle), second: read(second.handle) };
  const from = standIn.requests.length;
  const s = await start();
  try {
    expect(s.exits).toEqual([]);
    const born = standIn.requests.slice(from, s.seenAtOpen());
    expect(born.some((r) => r.session === first.session)).toBe(false);
    expect(born.some((r) => r.session === second.session)).toBe(false);
    expect(read(first.handle)).toBe(before.first);
    expect(read(second.handle)).toBe(before.second);
  } finally {
    await s.stop();
  }
});

it('a logon SAP refuses: exit 1 with the failure on stderr, and the transport never opens', async () => {
  standIn.refuse(true);
  const s = await start();
  expect(s.exits).toEqual([1]);
  expect(s.opened()).toBe(0);
  // The chain failure's own words.
  expect(s.stderr.at(-1)).toMatch(
    /^\[MCP\] the user or password was refused\n/,
  );
  expect(s.stderr.join('\n')).not.toContain('start-password');
});

it('ABAP Cloud without its system information: exit 1 naming it, the transport never opens, and the logon is logged off', async () => {
  standIn.answer(isLookup, 500);
  const s = await start({ kind: 'cloud' });
  expect(s.exits).toEqual([1]);
  expect(s.opened()).toBe(0);
  expect(s.stderr).toContain(`[MCP] ${startLookupFailedWords('default')}`);
  const end = Date.now() + 10_000;
  while (standIn.logoffs() === 0 && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 5));
  }
  expect(standIn.logoffs()).toBe(1);
  expect(runtimeFiles(runtime)).toEqual([]);
});

/** systeminformation answers that name no user: missing, empty, blank, not a string, not JSON. */
const WITHOUT_USER: Array<[string, string]> = [
  ['no userName', JSON.stringify({ systemID: 'CLD' })],
  ['an empty userName', JSON.stringify({ userName: '', systemID: 'CLD' })],
  ['a blank userName', JSON.stringify({ userName: '  ', systemID: 'CLD' })],
  ['a userName that is no string', JSON.stringify({ userName: 42 })],
  ['a body that is no JSON', 'not json'],
];

it.each(WITHOUT_USER)(
  'ABAP Cloud, systeminformation with %s: exit 1 in its own words, the transport never opens, and the logon is logged off',
  async (_what, body) => {
    standIn.body(isLookup, body);
    const s = await start({ kind: 'cloud' });
    expect(s.exits).toEqual([1]);
    expect(s.opened()).toBe(0);
    expect(s.stderr).toContain(
      `[MCP] ${startSystemWithoutUserWords('default')}`,
    );
    const end = Date.now() + 10_000;
    while (standIn.logoffs() === 0 && Date.now() < end) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(standIn.logoffs()).toBe(1);
    expect(runtimeFiles(runtime)).toEqual([]);
  },
);

it('ABAP Cloud: the system information is asked at the start, and a tool asks no more', async () => {
  standIn.body(
    isLookup,
    JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
  );
  const s = await start({ kind: 'cloud' });
  try {
    expect(s.exits).toEqual([]);
    expect(
      standIn.requests.slice(0, s.seenAtOpen()).filter(isLookup),
    ).toHaveLength(1);
    const before = standIn.requests.length;
    const read = await s.call('GetClass', { class_name: 'ZCL_AFTER_START' });
    expect(read.text).not.toContain('not found');
    expect(standIn.requests.length).toBeGreaterThan(before);
    expect(standIn.requests.filter(isLookup)).toHaveLength(1);
  } finally {
    await s.stop();
  }
});

it.each<[string, ToolSet]>([
  ['mcp-abap-adt', fullToolSet],
  ['mcp-abap-adt-ro', fullReadOnlyToolSet],
])(
  '%s lists no resume tool, and the list and the logoff',
  async (_bin, toolSet) => {
    const s = await start({ toolSet });
    try {
      const names = (await s.client.listTools()).tools.map((t) => t.name);
      expect(names.filter((n) => n.toLowerCase().includes('resume'))).toEqual(
        [],
      );
      expect(names.filter((n) => n.includes('Leftover'))).toHaveLength(2);
    } finally {
      await s.stop();
    }
  },
);
