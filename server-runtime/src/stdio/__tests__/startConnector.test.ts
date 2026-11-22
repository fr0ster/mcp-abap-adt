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

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
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
} from '../../../../src/__tests__/helpers/adtStandIn';
import { rejectionOf } from '../../../../src/__tests__/helpers/assertions';
import {
  killedProcessSession,
  runtimeFiles,
} from '../../../../src/__tests__/helpers/leftoverSession';
import {
  latch,
  resetProcessLatchForTests,
} from '../../../../src/lib/activeTools';
import { ServerRefusal } from '../../../../src/lib/auth/serverRefusal';
import type { KnownSystem } from '../../../../src/lib/leftoverSessions/LeftoverSessions';
import { ownedConnections } from '../../../../src/lib/ownedConnections';
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
      'SAP_CONNECTION_TYPE=http',
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
  mock.restoreAll();
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
      exits: readonly number[],
    ) => Promise<void>;
    /** Replaces the in-memory transport's `start` (a transport that cannot open). */
    openTransport?: () => Promise<void>;
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
    return options.openTransport === undefined
      ? open()
      : options.openTransport();
  };
  let seenAtOpen = -1;
  const stderr: string[] = [];
  const exits: number[] = [];
  const processLike = Object.assign(new EventEmitter(), {
    stdin: new EventEmitter(),
  });
  mock.method(process.stderr, 'write', () => true);
  const launched = launch(
    config,
    {
      toolSet: options.toolSet ?? fullToolSet,
      program: 'mcp-abap-adt',
      version: '0.0.0-test',
      packageName: '@mcp-abap-adt/core',
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
      exits,
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
    assert.deepStrictEqual(s.exits, []);
    assert.equal(s.opened(), 1);
    // Everything up to the transport's opening was the resume and the
    // system lookup, in the old session — no logon; the takeover's request
    // without the credential.
    const born = standIn.requests.slice(from, s.seenAtOpen());
    assert.ok(born.length > 0);
    for (const r of born) assert.equal(r.session, session);
    assert.equal(born[0]?.authorization, undefined);
    assert.deepStrictEqual(runtimeFiles(runtime), [handle]);
    const file = JSON.parse(
      fs.readFileSync(path.join(runtime, handle), 'utf8'),
    );
    assert.equal(file.pid, process.pid);

    const before = standIn.requests.length;
    assert.ok(
      (await s.call('ListLeftoverSessions')).text.includes('"sessions":[]'),
    );
    assert.equal(standIn.requests.length, before);
    const read = await s.call('GetClass', { class_name: 'ZCL_AFTER_START' });
    assert.ok(!read.text.includes('not found'));
    assert.deepStrictEqual(
      new Set(standIn.requests.slice(before).map((r) => r.session)),
      new Set([session]),
    );
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
    assert.deepStrictEqual(s.exits, []);
    const born = standIn.requests.slice(from, s.seenAtOpen());
    const fresh = new Set(
      born.filter((r) => r.session !== session).map((r) => r.session),
    );
    assert.equal(fresh.size, 1);
    assert.deepStrictEqual(runtimeFiles(runtime), [handle]);
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
  assert.deepStrictEqual(s.exits, [1]);
  assert.ok(s.stderr.includes(SHUTDOWN_BEFORE_START_LINE));
  assert.equal(s.opened(), 0);
  assert.deepStrictEqual(standIn.requests.filter(isLookup), []);
  assert.deepStrictEqual(runtimeFiles(runtime), [handle]);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(runtime, handle), 'utf8')).pid,
    111,
  );
  assert.deepStrictEqual(ownedConnections(), []);
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
  assert.deepStrictEqual(s.exits, [1]);
  assert.equal(s.opened(), 0);
  assert.deepStrictEqual(standIn.requests.filter(isLookup), []);
  assert.deepStrictEqual(runtimeFiles(runtime), [handle]);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(runtime, handle), 'utf8')).pid,
    111,
  );
  // The connection the resume built is ended: its logoff, nothing owned.
  const end = Date.now() + 10_000;
  while (standIn.logoffs() === 0 && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.deepStrictEqual(standIn.loggedOff(), [session]);
  assert.deepStrictEqual(ownedConnections(), []);
});

it('none: a normal logon at the start, before the transport opens', async () => {
  const s = await start();
  try {
    assert.deepStrictEqual(s.exits, []);
    const born = standIn.requests.slice(0, s.seenAtOpen());
    assert.equal(
      born.some((r) => r.authorization !== undefined),
      true,
    );
    assert.equal(new Set(born.map((r) => r.session)).size, 1);
    assert.equal(runtimeFiles(runtime).length, 1);
  } finally {
    await s.stop();
  }
});

for (const [trigger, kind] of [
  ['the end of stdin', 'onprem'],
  ['a signal', 'onprem'],
  ['the end of stdin', 'cloud'],
] satisfies ReadonlyArray<
  ['the end of stdin' | 'a signal', 'onprem' | 'cloud']
>) {
  it(
    format(
      'the shutdown (%s) while the start is still logging on (%s): the process exits 1 once, never 0, and the transport never opens',
      trigger,
      kind,
    ),
    async () => {
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
      assert.deepStrictEqual(s.exits, [1]);
      assert.ok(s.stderr.includes(SHUTDOWN_BEFORE_START_LINE));
      assert.equal(s.opened(), 0);
      assert.deepStrictEqual(standIn.requests.filter(isLookup), []);
      assert.deepStrictEqual(ownedConnections(), []);
    },
  );
}

for (const [trigger] of [
  ['the end of stdin'],
  ['a signal'],
] satisfies ReadonlyArray<['the end of stdin' | 'a signal']>) {
  it(
    format(
      'the shutdown (%s) while the startup check is still reading: the process exits 1 once, no logon, and the transport never opens',
      trigger,
    ),
    async (t) => {
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
      t.mock.method(
        AuthBrokerFactory.prototype,
        'settingsFor',
        async function (
          this: AuthBrokerFactory,
          ...args: Parameters<typeof settingsFor>
        ) {
          reading();
          await gate;
          return settingsFor.apply(this, args);
        },
      );
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
      assert.deepStrictEqual(s.exits, [1]);
      assert.ok(s.stderr.includes(SHUTDOWN_BEFORE_START_LINE));
      assert.equal(s.opened(), 0);
      assert.equal(standIn.requests.length, requestsBefore);
      assert.deepStrictEqual(ownedConnections(), []);
    },
  );
}

it('two: a normal logon, and both files are left untouched', async () => {
  const first = await leftover();
  const second = await leftover();
  const read = (handle: string) =>
    fs.readFileSync(path.join(runtime, handle), 'utf8');
  const before = { first: read(first.handle), second: read(second.handle) };
  const from = standIn.requests.length;
  const s = await start();
  try {
    assert.deepStrictEqual(s.exits, []);
    const born = standIn.requests.slice(from, s.seenAtOpen());
    assert.equal(
      born.some((r) => r.session === first.session),
      false,
    );
    assert.equal(
      born.some((r) => r.session === second.session),
      false,
    );
    assert.equal(read(first.handle), before.first);
    assert.equal(read(second.handle), before.second);
  } finally {
    await s.stop();
  }
});

it('a logon SAP refuses: exit 1 with the failure on stderr, and the transport never opens', async () => {
  standIn.refuse(true);
  const s = await start();
  assert.deepStrictEqual(s.exits, [1]);
  assert.equal(s.opened(), 0);
  // The chain failure's own words.
  assert.match(
    s.stderr.at(-1) ?? '',
    /^\[MCP\] the user or password was refused\n/,
  );
  assert.ok(!s.stderr.join('\n').includes('start-password'));
});

// On ABAP Cloud a `404` is a system without the endpoint every ABAP Cloud
// system has: the configuration is inconsistent.
it('ABAP Cloud, systeminformation answered 404: exit 1 naming an inconsistent configuration, the transport never opens, and the logon is logged off', async () => {
  standIn.answer(isLookup, 404);
  const s = await start({ kind: 'cloud' });
  assert.deepStrictEqual(s.exits, [1]);
  assert.equal(s.opened(), 0);
  assert.ok(
    s.stderr.includes(
      '[MCP] Destination "default": the destination is stated as ABAP Cloud, but its system has no systeminformation endpoint, which every ABAP Cloud system has: the configuration is inconsistent; the server did not start',
    ),
  );
  assert.ok(!s.stderr.includes(`[MCP] ${startLookupFailedWords('default')}`));
  const end = Date.now() + 10_000;
  while (standIn.logoffs() === 0 && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.equal(standIn.logoffs(), 1);
  assert.deepStrictEqual(runtimeFiles(runtime), []);
});

// Any other status but a `2xx` (`405`, `501`, `500`) is the ABAP system's
// problem with a valid configuration — never the login in its place.
for (const status of [500, 405, 501]) {
  it(
    format(
      'ABAP Cloud, systeminformation answered %i: exit 1 naming the lookup, the transport never opens, and the logon is logged off',
      status,
    ),
    async () => {
      standIn.answer(isLookup, status);
      const s = await start({ kind: 'cloud' });
      assert.deepStrictEqual(s.exits, [1]);
      assert.equal(s.opened(), 0);
      assert.ok(
        s.stderr.includes(`[MCP] ${startLookupFailedWords('default')}`),
      );
      const end = Date.now() + 10_000;
      while (standIn.logoffs() === 0 && Date.now() < end) {
        await new Promise((r) => setTimeout(r, 5));
      }
      assert.equal(standIn.logoffs(), 1);
      assert.deepStrictEqual(runtimeFiles(runtime), []);
    },
  );
}

// The logoff of a failed start is answered before the process ends: SAP
// ends a security session only once it received the logoff whole, so an
// exit right after the write would leave the session in SM05.
it('a start that fails after the logon exits 1 only once SAP answered its logoff', async () => {
  standIn.answer(isLookup, 500);
  const logoff = standIn.hold((r) => isLogoff(r.url));
  let exitsWhileHeld: number[] | undefined;
  const s = await start({
    kind: 'cloud',
    atBirth: async (_shutdown, _signal, exits) => {
      await logoff.arrived;
      // Long enough for an exit that does not wait to be recorded.
      await new Promise((r) => setTimeout(r, 100));
      exitsWhileHeld = [...exits];
      logoff.release();
    },
  });
  assert.deepStrictEqual(exitsWhileHeld, []);
  assert.deepStrictEqual(s.exits, [1]);
  assert.equal(s.opened(), 0);
  assert.ok(s.stderr.includes(`[MCP] ${startLookupFailedWords('default')}`));
  assert.equal(standIn.logoffs(), 1);
});

// A launch that rejects once the connector is born (the transport cannot
// open) settles only once the logoff of what the process owns is answered:
// the bin's exit follows the rejection.
it('a transport that cannot open: the launch rejects only once SAP answered the logoff', async () => {
  const logoff = standIn.hold((r) => isLogoff(r.url));
  let settledWhileHeld: boolean | undefined;
  let launchSettled = false;
  const failure = new Error('the transport cannot open');
  assert.equal(
    await rejectionOf(
      start({
        openTransport: async () => {
          // Seen from inside the launch: the logoff comes only after this
          // rejection, so the check runs beside it.
          void (async () => {
            await logoff.arrived;
            await new Promise((r) => setTimeout(r, 100));
            settledWhileHeld = launchSettled;
            logoff.release();
          })();
          throw failure;
        },
        atBirth: async () => undefined,
      }).finally(() => {
        launchSettled = true;
      }),
    ),
    failure,
  );
  assert.equal(settledWhileHeld, false);
  assert.equal(standIn.logoffs(), 1);
  assert.deepStrictEqual(ownedConnections(), []);
});

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

for (const [_what, body] of WITHOUT_USER) {
  it(
    format(
      'ABAP Cloud, systeminformation with %s: exit 1 naming the lookup, the transport never opens, and the logon is logged off',
      _what,
    ),
    async () => {
      standIn.body(isLookup, body);
      const s = await start({ kind: 'cloud' });
      assert.deepStrictEqual(s.exits, [1]);
      assert.equal(s.opened(), 0);
      assert.ok(
        s.stderr.includes(`[MCP] ${startLookupFailedWords('default')}`),
      );
      const end = Date.now() + 10_000;
      while (standIn.logoffs() === 0 && Date.now() < end) {
        await new Promise((r) => setTimeout(r, 5));
      }
      assert.equal(standIn.logoffs(), 1);
      assert.deepStrictEqual(runtimeFiles(runtime), []);
    },
  );
}

it('ABAP Cloud: the system information is asked at the start, and a tool asks no more', async () => {
  standIn.body(
    isLookup,
    JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
  );
  const s = await start({ kind: 'cloud' });
  try {
    assert.deepStrictEqual(s.exits, []);
    assert.equal(
      standIn.requests.slice(0, s.seenAtOpen()).filter(isLookup).length,
      1,
    );
    const before = standIn.requests.length;
    const read = await s.call('GetClass', { class_name: 'ZCL_AFTER_START' });
    assert.ok(!read.text.includes('not found'));
    assert.ok(standIn.requests.length > before);
    assert.equal(standIn.requests.filter(isLookup).length, 1);
  } finally {
    await s.stop();
  }
});

// The system kind is required: no parameter stating it ends the start
// before anything is sent and before the transport opens.
it('no system type stated anywhere: exit 1 naming the parameter, nothing sent, the transport never opens', async () => {
  delete process.env.SAP_SYSTEM_TYPE;
  const s = await start({ kind: null });
  assert.deepStrictEqual(s.exits, [1]);
  assert.equal(s.opened(), 0);
  assert.ok(
    s.stderr.includes(`[MCP] ${startSystemTypeRequiredWords('default')}`),
  );
  assert.deepStrictEqual(standIn.requests, []);
});

it('the --env file states it (SAP_SYSTEM_TYPE): the start goes on', async () => {
  delete process.env.SAP_SYSTEM_TYPE;
  fs.appendFileSync(envFile, 'SAP_SYSTEM_TYPE=onprem\n');
  const s = await start({ kind: null });
  try {
    assert.deepStrictEqual(s.exits, []);
    assert.equal(s.opened(), 1);
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
    assert.deepStrictEqual(s.exits, []);
    assert.equal(
      standIn.requests.slice(0, s.seenAtOpen()).filter(isLookup).length,
      1,
    );
    await s.call('GetClass', { class_name: 'ZCL_AFTER_START' });
    assert.equal(standIn.requests.filter(isLookup).length, 1);
  } finally {
    await s.stop();
  }
});

for (const [_case, answer] of [
  ['answered 404', () => standIn.answer(isLookup, 404)],
  ['answered 500', () => standIn.answer(isLookup, 500)],
  ['answered 405', () => standIn.answer(isLookup, 405)],
  [
    'without a user',
    () => standIn.body(isLookup, JSON.stringify({ systemID: 'OPS' })),
  ],
] satisfies ReadonlyArray<[string, () => void]>) {
  it(
    format(
      'on-premise, systeminformation %s: the start goes on with the start parameters',
      _case,
    ),
    async () => {
      answer();
      const s = await start({ kind: 'onprem' });
      try {
        assert.deepStrictEqual(s.exits, []);
        assert.equal(s.opened(), 1);
      } finally {
        await s.stop();
      }
    },
  );
}

for (const [_bin, toolSet, leftover] of [
  ['mcp-abap-adt', fullToolSet, 2],
  ['mcp-abap-adt-ro', fullReadOnlyToolSet, 1],
] satisfies ReadonlyArray<[string, ToolSet, number]>) {
  it(
    format(
      '%s lists no resume tool, and the list (the full set the logoff too)',
      _bin,
    ),
    async () => {
      const s = await start({ toolSet });
      try {
        const names = (await s.client.listTools()).tools.map((t) => t.name);
        assert.deepStrictEqual(
          names.filter((n) => n.toLowerCase().includes('resume')),
          [],
        );
        assert.equal(
          names.filter((n) => n.includes('Leftover')).length,
          leftover,
        );
      } finally {
        await s.stop();
      }
    },
  );
}

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
  assert.equal(
    words('system_lookup_failed'),
    startLookupFailedWords('default'),
  );
  assert.equal(
    words('cloud_without_systeminformation'),
    startCloudWithoutSystemInformationWords('default'),
  );
});

it('the start words of a refusal for an unknown session user name what to set', () => {
  assert.equal(
    startConnectionWords(
      new ServerRefusal('system_user_unknown'),
      'default',
      { sentenceFor: () => undefined },
      'linux',
    ),
    startSystemUserUnknownWords('default'),
  );
  assert.ok(startSystemUserUnknownWords('default').includes('SAP_USERNAME'));
});

/**
 * The start line names the network or TLS cause of a failed connection
 * (fr0ster/mcp-abap-adt#353): the thrown value's `code`, read safely, when it
 * is one of the fixed list — never its message, the URL or a host.
 */
describe('the start line names the network cause', () => {
  const words = (thrown: unknown) =>
    startConnectionWords(
      thrown,
      'default',
      { sentenceFor: () => undefined },
      'linux',
    );
  const failure = (code: unknown) =>
    Object.assign(new Error('connect ECONNREFUSED sap.example:443'), { code });

  for (const code of [
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'CERT_HAS_EXPIRED',
    'SELF_SIGNED_CERT_IN_CHAIN',
  ]) {
    it(format('a listed code is named: %s', code), () => {
      assert.equal(
        words(failure(code)),
        `Destination "default" could not be connected at start: Error (${code})`,
      );
    });
  }

  it('a code not on the list adds nothing, and the message never shows', () => {
    const line = words(failure('ERR_SOMETHING_ELSE'));
    assert.equal(
      line,
      'Destination "default" could not be connected at start: Error',
    );
    assert.ok(!line.includes('sap.example'));
  });

  it('a throwing code getter adds nothing and throws nothing', () => {
    const thrown = new Error('x');
    Object.defineProperty(thrown, 'code', {
      get() {
        throw new Error('the getter threw');
      },
    });
    assert.equal(
      words(thrown),
      'Destination "default" could not be connected at start: Error',
    );
  });
});
