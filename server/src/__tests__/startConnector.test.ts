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
  isLogoff,
  type StandInRequest,
} from '../../../src/__tests__/helpers/adtStandIn';
import {
  killedProcessSession,
  runtimeFiles,
} from '../../../src/__tests__/helpers/leftoverSession';
import { latch, resetProcessLatchForTests } from '../../../src/lib/activeTools';
import { ServerRefusal } from '../../../src/lib/auth/serverRefusal';
import type { KnownSystem } from '../../../src/lib/leftoverSessions/LeftoverSessions';
import { ownedConnections } from '../../../src/lib/ownedConnections';
import { AuthBrokerFactory } from '../auth';
import { readCoreConfig } from '../config/coreParameters';
import {
  launch,
  startCloudWithoutSystemInformationWords,
  startConnectionWords,
  startLookupFailedWords,
  startSystemTypeRequiredWords,
  startSystemUserUnknownWords,
} from '../launcher.js';
import { SHUTDOWN_BEFORE_START_LINE } from '../shutdown.js';

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
async function leftover(
  kind: 'onprem' | 'cloud' = 'onprem',
  system?: KnownSystem,
) {
  process.env.SAP_SYSTEM_TYPE = kind;
  const handle = await killedProcessSession(standIn.url, runtime, {
    user: USER,
    destination: 'default',
    ...(system !== undefined && { system }),
  });
  const session = standIn.requests.at(-1)?.session ?? '';
  return { handle, session };
}

/** What the exit stub throws: execution stops at the first exit. */
const EXITED = Symbol('exited');

/** Waits until the process exited (the stub's first call), then a little more. */
async function exited(exits: number[]): Promise<void> {
  const end = Date.now() + 10_000;
  while (exits.length === 0 && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 5));
  }
  // Long enough for a second exit, were there one, to be recorded.
  await new Promise((r) => setTimeout(r, 50));
}

/** Launches `mcp-abap-adt` (or `toolSet`) over an in-memory transport. */
async function start(
  options: {
    /** `null`: no `--system-type` at all. */
    kind?: 'onprem' | 'cloud' | null;
    toolSet?: ToolSet;
    /**
     * Runs beside the launch, while the connection is born; `shutdown()`
     * starts the shutdown as the end of stdin does.
     */
    atBirth?: (
      shutdown: () => void,
      signal: (name: 'SIGTERM' | 'SIGINT') => void,
    ) => Promise<void>;
  } = {},
) {
  const args = [
    `--env-path=${envFile}`,
    `--auth-broker-path=${root}`,
    ...(options.kind === null
      ? []
      : [`--system-type=${options.kind ?? 'onprem'}`]),
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
  const launched = launch(
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
      // A real exit ends the process at its first call: this one stops
      // the caller there too, so a later exit cannot hide the first.
      exit: (code) => {
        exits.push(code);
        throw EXITED;
      },
      processLike,
      platform: 'linux',
      transport: serverSide,
    },
  );
  await Promise.all([
    launched.catch((error: unknown) => {
      if (error !== EXITED) throw error;
    }),
    options.atBirth?.(
      () => processLike.stdin.emit('end'),
      (name) => processLike.emit(name),
    ),
  ]);
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
    // Everything up to the transport's opening was the resume and the
    // system lookup, in the old session — no logon; the takeover's request
    // without the credential.
    const born = standIn.requests.slice(from, s.seenAtOpen());
    expect(born.length).toBeGreaterThan(0);
    for (const r of born) expect(r.session).toBe(session);
    expect(born[0]?.authorization).toBeUndefined();
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

it('the shutdown lands while a leftover with its system information is resumed: the start fails, the transport never opens, the file is a leftover again, nothing owned', async () => {
  const { handle, session } = await leftover('cloud', {
    responsible: 'FILE_USER',
    masterSystem: 'FIL',
  });
  // The resume's request in the old session, held until the shutdown began.
  const held = standIn.hold((r) => r.session === session && !isLogoff(r.url));
  const s = await start({
    kind: 'cloud',
    atBirth: async (shutdown) => {
      await held.arrived;
      shutdown();
      held.release();
    },
  });
  await exited(s.exits);
  // The one exit is the shutdown's, and it is 1: the start failed.
  expect(s.exits).toEqual([1]);
  expect(s.stderr).toContain(SHUTDOWN_BEFORE_START_LINE);
  expect(s.opened()).toBe(0);
  expect(standIn.requests.filter(isLookup)).toEqual([]);
  expect(runtimeFiles(runtime)).toEqual([handle]);
  expect(
    JSON.parse(fs.readFileSync(path.join(runtime, handle), 'utf8')).pid,
  ).toBe(111);
  expect(ownedConnections()).toEqual([]);
});

it('the latch lands while a leftover with its system information is resumed and SAP answers: the start fails, the transport never opens, the file is a leftover again, nothing owned', async () => {
  const { handle, session } = await leftover('cloud', {
    responsible: 'FILE_USER',
    masterSystem: 'FIL',
  });
  // The resume's request answered only once the process is latched, before
  // any logoff reached the connection: its connect() succeeds.
  const held = standIn.hold((r) => r.session === session && !isLogoff(r.url));
  const s = await start({
    kind: 'cloud',
    atBirth: async () => {
      await held.arrived;
      latch();
      held.release();
    },
  });
  expect(s.exits).toEqual([1]);
  expect(s.opened()).toBe(0);
  expect(standIn.requests.filter(isLookup)).toEqual([]);
  expect(runtimeFiles(runtime)).toEqual([handle]);
  expect(
    JSON.parse(fs.readFileSync(path.join(runtime, handle), 'utf8')).pid,
  ).toBe(111);
  // The connection the resume built is ended: its logoff, nothing owned.
  const end = Date.now() + 10_000;
  while (standIn.logoffs() === 0 && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 5));
  }
  expect(standIn.loggedOff()).toEqual([session]);
  expect(ownedConnections()).toEqual([]);
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

it.each<['the end of stdin' | 'a signal', 'onprem' | 'cloud']>([
  ['the end of stdin', 'onprem'],
  ['a signal', 'onprem'],
  ['the end of stdin', 'cloud'],
])(
  'the shutdown (%s) while the start is still logging on (%s): the process exits 1 once, never 0, and the transport never opens',
  async (trigger, kind) => {
    process.env.SAP_SYSTEM_TYPE = kind;
    // The logon's first request, held until the shutdown began.
    const held = standIn.hold((r) => !isLogoff(r.url));
    const s = await start({
      kind,
      atBirth: async (shutdown, signal) => {
        await held.arrived;
        if (trigger === 'a signal') signal('SIGTERM');
        else shutdown();
        held.release();
      },
    });
    await exited(s.exits);
    expect(s.exits).toEqual([1]);
    expect(s.stderr).toContain(SHUTDOWN_BEFORE_START_LINE);
    expect(s.opened()).toBe(0);
    expect(standIn.requests.filter(isLookup)).toEqual([]);
    expect(ownedConnections()).toEqual([]);
  },
);

it.each<['the end of stdin' | 'a signal']>([
  ['the end of stdin'],
  ['a signal'],
])(
  'the shutdown (%s) while the startup check is still reading: the process exits 1 once, no logon, and the transport never opens',
  async (trigger) => {
    // The check's first read, held: the start is still before its logon.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reading: () => void = () => {};
    const arrived = new Promise<void>((resolve) => {
      reading = resolve;
    });
    const settingsFor = AuthBrokerFactory.prototype.settingsFor;
    jest
      .spyOn(AuthBrokerFactory.prototype, 'settingsFor')
      .mockImplementation(async function (this: AuthBrokerFactory, ...args) {
        reading();
        await gate;
        return settingsFor.apply(this, args);
      });
    const requestsBefore = standIn.requests.length;
    const s = await start({
      atBirth: async (shutdown, signal) => {
        await arrived;
        if (trigger === 'a signal') signal('SIGTERM');
        else shutdown();
        // Let the shutdown run its first steps before the read answers.
        await new Promise((r) => setTimeout(r, 20));
        release();
      },
    });
    await exited(s.exits);
    expect(s.exits).toEqual([1]);
    expect(s.stderr).toContain(SHUTDOWN_BEFORE_START_LINE);
    expect(s.opened()).toBe(0);
    expect(standIn.requests.length).toBe(requestsBefore);
    expect(ownedConnections()).toEqual([]);
  },
);

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

// On ABAP Cloud a `404` is a system without the endpoint every ABAP Cloud
// system has: the configuration is inconsistent.
it('ABAP Cloud, systeminformation answered 404: exit 1 naming an inconsistent configuration, the transport never opens, and the logon is logged off', async () => {
  standIn.answer(isLookup, 404);
  const s = await start({ kind: 'cloud' });
  expect(s.exits).toEqual([1]);
  expect(s.opened()).toBe(0);
  expect(s.stderr).toContain(
    '[MCP] Destination "default": the destination is stated as ABAP Cloud, but its system has no systeminformation endpoint, which every ABAP Cloud system has: the configuration is inconsistent; the server did not start',
  );
  expect(s.stderr).not.toContain(`[MCP] ${startLookupFailedWords('default')}`);
  const end = Date.now() + 10_000;
  while (standIn.logoffs() === 0 && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 5));
  }
  expect(standIn.logoffs()).toBe(1);
  expect(runtimeFiles(runtime)).toEqual([]);
});

// Any other status but a `2xx` (`405`, `501`, `500`) is the ABAP system's
// problem with a valid configuration — never the login in its place.
it.each([500, 405, 501])(
  'ABAP Cloud, systeminformation answered %i: exit 1 naming the lookup, the transport never opens, and the logon is logged off',
  async (status) => {
    standIn.answer(isLookup, status);
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
  },
);

/** systeminformation answers that name no user: missing, empty, blank, not a string, not JSON, JSON that is no object. */
const WITHOUT_USER: Array<[string, string]> = [
  ['no userName', JSON.stringify({ systemID: 'CLD' })],
  ['an empty userName', JSON.stringify({ userName: '', systemID: 'CLD' })],
  ['a blank userName', JSON.stringify({ userName: '  ', systemID: 'CLD' })],
  ['a userName that is no string', JSON.stringify({ userName: 42 })],
  ['a body that is no JSON', 'not json'],
  ['a JSON array', JSON.stringify([{ userName: 'ARRAY_USER' }])],
  ['a JSON number', '42'],
  ['JSON null', 'null'],
];

it.each(WITHOUT_USER)(
  'ABAP Cloud, systeminformation with %s: exit 1 naming the lookup, the transport never opens, and the logon is logged off',
  async (_what, body) => {
    standIn.body(isLookup, body);
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

// The system kind is required: no parameter stating it ends the start
// before anything is sent and before the transport opens.
it('no system type stated anywhere: exit 1 naming the parameter, nothing sent, the transport never opens', async () => {
  delete process.env.SAP_SYSTEM_TYPE;
  const s = await start({ kind: null });
  expect(s.exits).toEqual([1]);
  expect(s.opened()).toBe(0);
  expect(s.stderr).toContain(
    `[MCP] ${startSystemTypeRequiredWords('default')}`,
  );
  expect(standIn.requests).toEqual([]);
});

it('the --env file states it (SAP_SYSTEM_TYPE): the start goes on', async () => {
  delete process.env.SAP_SYSTEM_TYPE;
  fs.appendFileSync(envFile, 'SAP_SYSTEM_TYPE=onprem\n');
  const s = await start({ kind: null });
  try {
    expect(s.exits).toEqual([]);
    expect(s.opened()).toBe(1);
  } finally {
    await s.stop();
  }
});

// On-premise the system is asked at the start too; no information there (a
// `404`, an answer without a user, an error) and the start goes on with the
// start parameters (the destination states the user).
it('on-premise: the system information is asked at the start, and a tool asks no more', async () => {
  standIn.body(
    isLookup,
    JSON.stringify({ userName: 'OP_USER', systemID: 'OPS' }),
  );
  const s = await start({ kind: 'onprem' });
  try {
    expect(s.exits).toEqual([]);
    expect(
      standIn.requests.slice(0, s.seenAtOpen()).filter(isLookup),
    ).toHaveLength(1);
    await s.call('GetClass', { class_name: 'ZCL_AFTER_START' });
    expect(standIn.requests.filter(isLookup)).toHaveLength(1);
  } finally {
    await s.stop();
  }
});

it.each<[string, () => void]>([
  ['answered 404', () => standIn.answer(isLookup, 404)],
  ['answered 500', () => standIn.answer(isLookup, 500)],
  ['answered 405', () => standIn.answer(isLookup, 405)],
  [
    'without a user',
    () => standIn.body(isLookup, JSON.stringify({ systemID: 'OPS' })),
  ],
])(
  'on-premise, systeminformation %s: the start goes on with the start parameters',
  async (_case, answer) => {
    answer();
    const s = await start({ kind: 'onprem' });
    try {
      expect(s.exits).toEqual([]);
      expect(s.opened()).toBe(1);
    } finally {
      await s.stop();
    }
  },
);

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

it('the start words of the lookup refusals', () => {
  const words = (
    code: 'system_lookup_failed' | 'cloud_without_systeminformation',
  ) =>
    startConnectionWords(
      new ServerRefusal(code),
      'default',
      { sentenceFor: () => undefined },
      'linux',
    );
  expect(words('system_lookup_failed')).toBe(startLookupFailedWords('default'));
  expect(words('cloud_without_systeminformation')).toBe(
    startCloudWithoutSystemInformationWords('default'),
  );
});

it('the start words of a refusal for an unknown session user name what to set', () => {
  expect(
    startConnectionWords(
      new ServerRefusal('system_user_unknown'),
      'default',
      { sentenceFor: () => undefined },
      'linux',
    ),
  ).toBe(startSystemUserUnknownWords('default'));
  expect(startSystemUserUnknownWords('default')).toContain('SAP_USERNAME');
});
