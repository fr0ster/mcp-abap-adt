/**
 * stdio with `--deferred-logon` (#353): the start contacts no SAP system,
 * lists the declared type's tools and opens the transport; the first tool
 * call that needs a connection logs on.
 *
 * The whole launcher over an in-memory transport. The destination's URL is
 * a loopback port this file owns (`PortGate`): closed (nothing listens), a
 * listener that counts and resets every connection, or a forwarder to the
 * ADT stand-in — so the system is unreachable, then reachable, on one URL.
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { runtimeDirectory } from '@mcp-abap-adt/lib/embeddable';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  type AdtStandIn,
  adtStandIn,
  isLogoff,
} from '../../../../src/__tests__/helpers/adtStandIn';
import {
  killedProcessSession,
  runtimeFiles,
} from '../../../../src/__tests__/helpers/leftoverSession';
import { resetProcessLatchForTests } from '../../../../src/lib/activeTools';
import { ServerRefusal } from '../../../../src/lib/auth/serverRefusal';
import { registryOf } from '../../../../src/lib/toolSet';
import type { IDestinations } from '../auth/IAuthBrokerFactory.js';
import { readCoreConfig } from '../config/coreParameters';
import { launch } from '../launcher.js';
import { StdioServer } from '../StdioServer.js';

const USER = 'DEFERRED_USER';
const PASSWORD = 'deferred-password';

/** A loopback port of this file's: closed, resetting, or forwarding. */
class PortGate {
  private server: net.Server | undefined;
  private readonly sockets = new Set<net.Socket>();
  /** Connections the resetting listener accepted (each one reset). */
  resets = 0;

  private constructor(readonly port: number) {}

  /** A port free now, nothing listening on it. */
  static async closed(): Promise<PortGate> {
    const probe = net.createServer();
    const port = await new Promise<number>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        if (address !== null && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('the probe has no port'));
        }
      });
    });
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    return new PortGate(port);
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Every connection accepted and reset at once. */
  async reset(): Promise<void> {
    await this.listen((socket) => {
      this.resets += 1;
      socket.resetAndDestroy();
    });
  }

  /** Every connection forwarded to `target`'s port on loopback. */
  async forward(target: string): Promise<void> {
    const port = Number(new URL(target).port);
    await this.listen((socket) => {
      const upstream = net.connect(port, '127.0.0.1');
      this.sockets.add(upstream);
      upstream.on('close', () => this.sockets.delete(upstream));
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
      socket.pipe(upstream).pipe(socket);
    });
  }

  /** Nothing listens any more; every open connection is ended. */
  async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    if (server === undefined) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async listen(onSocket: (socket: net.Socket) => void): Promise<void> {
    await this.close();
    const server = net.createServer((socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
      onSocket(socket);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.port, '127.0.0.1', () => resolve());
    });
    this.server = server;
  }
}

/** What the exit stub throws: execution stops at the first exit. */
const EXITED = Symbol('exited');

let root: string;
let envFile: string;
let standIn: AdtStandIn;
let gate: PortGate;
const savedEnv = { ...process.env };

beforeEach(async () => {
  resetProcessLatchForTests();
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'deferred-')));
  standIn = await adtStandIn();
  gate = await PortGate.closed();
  envFile = path.join(root, 'deferred.env');
  fs.writeFileSync(
    envFile,
    [
      `SAP_URL=${gate.url}`,
      'SAP_CLIENT=100',
      'SAP_AUTH_TYPE=basic',
      'SAP_CONNECTION_TYPE=http',
      `SAP_USERNAME=${USER}`,
      `SAP_PASSWORD=${PASSWORD}`,
      '',
    ].join('\n'),
  );
  for (const name of [
    'SAP_SYSTEM_TYPE',
    'SAP_CONNECTION_TYPE',
    'MCP_ENV_PATH',
    'MCP_DEFERRED_LOGON',
    'MCP_RESTORE_SESSION',
  ]) {
    delete process.env[name];
  }
  mock.method(process.stderr, 'write', () => true);
});

afterEach(async () => {
  mock.restoreAll();
  await gate.close();
  await standIn.close();
  fs.rmSync(root, { recursive: true, force: true });
  process.env = { ...savedEnv };
});

/** Launches `mcp-abap-adt` over an in-memory transport, with `flags`. */
async function start(flags: readonly string[] = ['--deferred-logon']) {
  const args = [
    `--env-path=${envFile}`,
    `--auth-broker-path=${root}`,
    '--system-type=onprem',
    ...flags,
  ];
  const config = readCoreConfig(args, process.env, null);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  let opened = 0;
  let seenAtOpen = -1;
  let resetsAtOpen = -1;
  const open = serverSide.start.bind(serverSide);
  serverSide.start = async () => {
    opened += 1;
    seenAtOpen = standIn.requests.length;
    resetsAtOpen = gate.resets;
    return open();
  };
  const stderr: string[] = [];
  const exits: number[] = [];
  // Settles at the process's first exit: what `stop()` waits for.
  let exitedOnce: () => void = () => {};
  const exited = new Promise<void>((resolve) => {
    exitedOnce = resolve;
  });
  const processLike = Object.assign(new EventEmitter(), {
    stdin: new EventEmitter(),
  });
  // A real exit ends the process at its first call: while the start runs,
  // the stub stops the launcher there too. Once the transport is open, an
  // exit (the shutdown's) is only recorded.
  let starting = true;
  await launch(
    config,
    {
      toolSet: fullToolSet,
      program: 'mcp-abap-adt',
      version: '0.0.0-test',
      packageName: '@mcp-abap-adt/core',
    },
    {
      browserStrategy: () => {
        throw new Error('no login in this test');
      },
      stderr: (line) => stderr.push(line),
      exit: (code) => {
        exits.push(code);
        exitedOnce();
        if (starting) throw EXITED;
      },
      processLike,
      platform: 'linux',
      transport: serverSide,
    },
  ).catch((error: unknown) => {
    if (error !== EXITED) throw error;
  });
  starting = false;
  const client = new Client({ name: 'deferred', version: '1.0.0' });
  const connected = opened > 0;
  if (connected) await client.connect(clientSide);
  return {
    stderr,
    exits,
    opened: () => opened,
    seenAtOpen: () => seenAtOpen,
    resetsAtOpen: () => resetsAtOpen,
    tools: async () =>
      (await client.listTools()).tools.map((tool) => tool.name).sort(),
    call: async (name: string, args: Record<string, unknown> = {}) => {
      const answer = await client.callTool({ name, arguments: args });
      const content = Array.isArray(answer.content) ? answer.content : [];
      const text = content
        .map((part: unknown) =>
          typeof part === 'object' &&
          part !== null &&
          'text' in part &&
          typeof part.text === 'string'
            ? part.text
            : '',
        )
        .join('');
      return { text, isError: answer.isError === true };
    },
    /** The shutdown, as the end of stdin starts it; resolves once it exited. */
    stop: async () => {
      if (connected) await client.close().catch(() => undefined);
      processLike.stdin.emit('end');
      await exited;
    },
  };
}

describe('the deferred start', () => {
  it('nothing listening: the transport opens, nothing exits, the deferred line is written', async () => {
    const s = await start();
    try {
      assert.deepEqual(s.exits, []);
      assert.equal(s.opened(), 1);
      // Fixed words and the destination's name: no URL, no port. (The
      // summary before it shows the settings, as every start does.)
      assert.equal(
        s.stderr.at(-1),
        '[MCP] Destination "default": the logon is deferred to the first tool call (deferred logon)',
      );
    } finally {
      await s.stop();
    }
  });

  it('nothing reaches the address during the start', async () => {
    await gate.reset();
    const s = await start();
    try {
      assert.equal(s.opened(), 1);
      assert.equal(s.resetsAtOpen(), 0);
      assert.equal(gate.resets, 0);
    } finally {
      await s.stop();
    }
  });

  it('the tools listed are those a start without the flag lists for the same type', async () => {
    await gate.forward(standIn.url);
    const logged = await start([]);
    let withoutFlag: string[];
    try {
      assert.deepEqual(logged.exits, [], logged.stderr.join('\n'));
      assert.equal(logged.opened(), 1, logged.stderr.join('\n'));
      withoutFlag = await logged.tools();
    } finally {
      await logged.stop();
    }
    resetProcessLatchForTests();
    await gate.close();
    const deferred = await start();
    try {
      assert.deepEqual(await deferred.tools(), withoutFlag);
      assert.equal(withoutFlag.length > 0, true);
    } finally {
      await deferred.stop();
    }
  });

  it('without the flag, an unreachable system still ends the start with exit 1', async () => {
    const s = await start([]);
    assert.deepEqual(s.exits, [1]);
    assert.equal(s.opened(), 0);
  });

  it('with the flag, a missing system type still stops the start', async () => {
    const config = readCoreConfig(
      [
        `--env-path=${envFile}`,
        `--auth-broker-path=${root}`,
        '--deferred-logon',
      ],
      process.env,
      null,
    );
    const exits: number[] = [];
    const stderr: string[] = [];
    await launch(
      config,
      {
        toolSet: fullToolSet,
        program: 'mcp-abap-adt',
        version: '0.0.0-test',
        packageName: '@mcp-abap-adt/core',
      },
      {
        browserStrategy: () => {
          throw new Error('no login in this test');
        },
        stderr: (line) => stderr.push(line),
        exit: (code) => {
          exits.push(code);
          throw EXITED;
        },
        processLike: Object.assign(new EventEmitter(), {
          stdin: new EventEmitter(),
        }),
        platform: 'linux',
      },
    ).catch((error: unknown) => {
      if (error !== EXITED) throw error;
    });
    assert.deepEqual(exits, [1]);
    assert.equal(
      stderr.some((line) => line.includes('the SAP system type is required')),
      true,
    );
  });
});

/** The failure answer's fields; `{}` for a text that is not one. */
function payloadOf(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? { ...parsed } : {};
  } catch {
    return {};
  }
}

/** The answer holds nothing of the address or the credentials. */
function assertNoAddress(text: string): void {
  for (const secret of [
    gate.url,
    '127.0.0.1',
    String(gate.port),
    USER,
    PASSWORD,
  ]) {
    assert.equal(text.includes(secret), false, `the answer names ${secret}`);
  }
}

describe('no connection: every failed build answers no_connection', () => {
  it('nothing listening: the call answers no_connection with ECONNREFUSED, and no address', async () => {
    const s = await start();
    try {
      const answer = await s.call('GetAdtTypes');
      assert.equal(answer.isError, true);
      const payload = payloadOf(answer.text);
      assert.equal(payload.error, 'no_connection');
      assert.equal(
        payload.message,
        'no connection to the SAP system: the connection failed (ECONNREFUSED); the next tool call tries again',
      );
      assertNoAddress(answer.text);
    } finally {
      await s.stop();
    }
  });

  it('two consecutive failing first calls: each answers no_connection, each one new attempt', async () => {
    await gate.reset();
    const s = await start();
    try {
      const first = await s.call('GetAdtTypes');
      assert.equal(payloadOf(first.text).error, 'no_connection');
      assert.equal(
        String(payloadOf(first.text).message).includes('(ECONNRESET)'),
        true,
      );
      const afterFirst = gate.resets;
      assert.equal(afterFirst > 0, true);
      const second = await s.call('GetAdtTypes');
      assert.equal(payloadOf(second.text).error, 'no_connection');
      assert.equal(gate.resets, afterFirst * 2);
      assertNoAddress(first.text);
      assertNoAddress(second.text);
    } finally {
      await s.stop();
    }
  });

  it('two calls at once while there is no connection share one attempt', async () => {
    await gate.reset();
    const s = await start();
    try {
      const single = await s.call('GetAdtTypes');
      assert.equal(payloadOf(single.text).error, 'no_connection');
      const one = gate.resets;
      const [a, b] = await Promise.all([
        s.call('GetAdtTypes'),
        s.call('GetAdtTypes'),
      ]);
      assert.equal(payloadOf(a.text).error, 'no_connection');
      assert.equal(payloadOf(b.text).error, 'no_connection');
      assert.equal(gate.resets, one * 2);
    } finally {
      await s.stop();
    }
  });

  it('the system listens later: the next call logs on and answers; the one after logs on no more', async () => {
    const s = await start();
    try {
      const refused = await s.call('GetAdtTypes');
      assert.equal(payloadOf(refused.text).error, 'no_connection');
      await gate.forward(standIn.url);
      const from = standIn.requests.length;
      const answered = await s.call('GetAdtTypes');
      assert.equal(answered.isError, false, answered.text);
      const sessions = new Set(
        standIn.requests.slice(from).map((request) => request.session),
      );
      assert.equal(sessions.size, 1);
      const next = standIn.requests.length;
      const again = await s.call('GetAdtTypes');
      assert.equal(again.isError, false, again.text);
      const later = standIn.requests.slice(next);
      assert.equal(later.length > 0, true);
      for (const request of later) {
        assert.equal(sessions.has(request.session), true);
      }
    } finally {
      await s.stop();
    }
  });

  it('a refused credential (401) is answered as today, not as no_connection', async () => {
    await gate.forward(standIn.url);
    standIn.refuse(true);
    const s = await start();
    try {
      const answer = await s.call('GetAdtTypes');
      assert.equal(answer.isError, true);
      assert.notEqual(payloadOf(answer.text).error, 'no_connection');
    } finally {
      await s.stop();
    }
  });
});

/**
 * A `StdioServer` on its own, its destination a stub whose provider throws
 * `thrown`: what a failed build answers, condition by condition.
 */
async function serverOn(
  destinations: IDestinations,
  deferredLogon: boolean,
): Promise<{
  call: () => Promise<{ text: string; isError: boolean }>;
  close: () => Promise<void>;
}> {
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  const server = new StdioServer(
    registryOf(fullToolSet, 'stdio'),
    destinations,
    {
      version: '0.0.0-test',
      deferredLogon,
    },
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.start('dest', serverSide);
  const client = new Client({ name: 'deferred-unit', version: '1.0.0' });
  await client.connect(clientSide);
  return {
    call: async () => {
      const answer = await client.callTool({
        name: 'GetAdtTypes',
        arguments: {},
      });
      const content = Array.isArray(answer.content) ? answer.content : [];
      const text = content
        .map((part: unknown) =>
          typeof part === 'object' &&
          part !== null &&
          'text' in part &&
          typeof part.text === 'string'
            ? part.text
            : '',
        )
        .join('');
      return { text, isError: answer.isError === true };
    },
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

/** A destination whose provider throws `thrown`. */
function throwingDestination(thrown: unknown): IDestinations {
  return {
    settingsFor: async () => ({
      url: gate.url,
      client: '100',
      authType: 'basic',
      connectionType: 'http',
      username: USER,
    }),
    getProvider: async () => {
      throw thrown;
    },
  };
}

describe('no_connection: one condition at a time', () => {
  it('a listed code with no SAP answer, unread by the reader: no_connection', async () => {
    const thrown = Object.assign(
      new Error(`connect ECONNREFUSED ${gate.url}`),
      {
        code: 'ECONNREFUSED',
      },
    );
    const s = await serverOn(throwingDestination(thrown), true);
    try {
      const answer = await s.call();
      assert.equal(payloadOf(answer.text).error, 'no_connection');
      assertNoAddress(answer.text);
    } finally {
      await s.close();
    }
  });

  it('without the flag, the same throw is answered as today', async () => {
    const thrown = Object.assign(
      new Error(`connect ECONNREFUSED ${gate.url}`),
      {
        code: 'ECONNREFUSED',
      },
    );
    const s = await serverOn(throwingDestination(thrown), false);
    try {
      const answer = await s.call();
      assert.equal(answer.isError, true);
      assert.notEqual(payloadOf(answer.text).error, 'no_connection');
    } finally {
      await s.close();
    }
  });

  it('a value the reader reads, though its code is listed: answered as the reader reads it', async () => {
    const thrown = Object.assign(new ServerRefusal('inspection_only'), {
      code: 'ECONNREFUSED',
    });
    const s = await serverOn(throwingDestination(thrown), true);
    try {
      assert.equal(payloadOf((await s.call()).text).error, 'inspection_only');
    } finally {
      await s.close();
    }
  });

  it('a value carrying the answer of SAP and a listed code: not no_connection', async () => {
    const thrown = Object.assign(new Error('the system answered'), {
      code: 'ECONNRESET',
      response: { status: 503, data: '' },
    });
    const s = await serverOn(throwingDestination(thrown), true);
    try {
      assert.notEqual(payloadOf((await s.call()).text).error, 'no_connection');
    } finally {
      await s.close();
    }
  });

  it('an unlisted code: not no_connection', async () => {
    const thrown = Object.assign(new Error('something else'), {
      code: 'ERR_SOMETHING_ELSE',
    });
    const s = await serverOn(throwingDestination(thrown), true);
    try {
      assert.notEqual(payloadOf((await s.call()).text).error, 'no_connection');
    } finally {
      await s.close();
    }
  });
});

/** The pid a runtime file was written by. */
function writerOf(handle: string): unknown {
  const file: unknown = JSON.parse(
    fs.readFileSync(path.join(runtimeDirectory(root), handle), 'utf8'),
  );
  return typeof file === 'object' && file !== null && 'pid' in file
    ? file.pid
    : undefined;
}

/** A session a killed process left for this destination, through the gate. */
async function leftover(): Promise<{ handle: string; session: string }> {
  await gate.forward(standIn.url);
  const handle = await killedProcessSession(gate.url, runtimeDirectory(root), {
    user: USER,
    destination: 'default',
  });
  return { handle, session: standIn.requests.at(-1)?.session ?? '' };
}

/** The sessions the requests since `from` ran in, logoffs left out. */
const sessionsSince = (from: number): Set<string> =>
  new Set(
    standIn.requests
      .slice(from)
      .filter((request) => !isLogoff(request.url))
      .map((request) => request.session),
  );

describe('the leftover session and the deferred logon', () => {
  for (const flags of [
    ['--deferred-logon'],
    ['--deferred-logon', '--restore-session=false'],
  ]) {
    it(`${flags.join(' ')}: the start claims nothing, the first call logs on, the leftover stays listed`, async () => {
      const { handle, session } = await leftover();
      const s = await start(flags);
      try {
        assert.equal(writerOf(handle), 111);
        const from = standIn.requests.length;
        const read = await s.call('GetAdtTypes');
        assert.equal(read.isError, false, read.text);
        const used = sessionsSince(from);
        assert.equal(used.has(session), false);
        assert.equal(used.size, 1);
        assert.equal(writerOf(handle), 111);
        const listed = await s.call('ListLeftoverSessions');
        assert.equal(listed.text.includes(handle), true, listed.text);
      } finally {
        await s.stop();
      }
    });
  }

  it('both flags: the start claims nothing; the first call takes the session up, no logon; the next call neither', async () => {
    const { handle, session } = await leftover();
    const s = await start(['--deferred-logon', '--restore-session']);
    try {
      assert.equal(writerOf(handle), 111);
      const from = standIn.requests.length;
      const read = await s.call('GetAdtTypes');
      assert.equal(read.isError, false, read.text);
      assert.deepEqual([...sessionsSince(from)], [session]);
      assert.equal(standIn.requests[from]?.authorization, undefined);
      assert.deepEqual(runtimeFiles(runtimeDirectory(root)), [handle]);
      assert.equal(writerOf(handle), process.pid);
      const next = standIn.requests.length;
      const again = await s.call('GetAdtTypes');
      assert.equal(again.isError, false, again.text);
      assert.deepEqual([...sessionsSince(next)], [session]);
    } finally {
      await s.stop();
    }
  });

  it('both flags, the system unreachable: no_connection, the file given back; reachable again, the next call takes it up', async () => {
    const { handle, session } = await leftover();
    await gate.close();
    const s = await start(['--deferred-logon', '--restore-session']);
    try {
      const refused = await s.call('GetAdtTypes');
      assert.equal(payloadOf(refused.text).error, 'no_connection');
      assert.equal(writerOf(handle), 111);
      await gate.forward(standIn.url);
      const from = standIn.requests.length;
      const read = await s.call('GetAdtTypes');
      assert.equal(read.isError, false, read.text);
      assert.deepEqual([...sessionsSince(from)], [session]);
      assert.equal(writerOf(handle), process.pid);
    } finally {
      await s.stop();
    }
  });

  it('both flags, SAP answering the old session ended: the first call logs on, the file adopted under the same handle', async () => {
    const { handle, session } = await leftover();
    standIn.answer((request) => request.session === session, 401);
    const s = await start(['--deferred-logon', '--restore-session']);
    try {
      const from = standIn.requests.length;
      const read = await s.call('GetAdtTypes');
      assert.equal(read.isError, false, read.text);
      const fresh = [...sessionsSince(from)].filter((one) => one !== session);
      assert.equal(fresh.length, 1);
      assert.deepEqual(runtimeFiles(runtimeDirectory(root)), [handle]);
      assert.equal(writerOf(handle), process.pid);
    } finally {
      await s.stop();
    }
  });

  it('both flags, two leftovers: none taken up, the first call logs on, both stay', async () => {
    const one = await leftover();
    const two = await leftover();
    const s = await start(['--deferred-logon', '--restore-session']);
    try {
      const from = standIn.requests.length;
      const read = await s.call('GetAdtTypes');
      assert.equal(read.isError, false, read.text);
      const used = sessionsSince(from);
      assert.equal(used.has(one.session), false);
      assert.equal(used.has(two.session), false);
      assert.equal(writerOf(one.handle), 111);
      assert.equal(writerOf(two.handle), 111);
    } finally {
      await s.stop();
    }
  });

  it('after a take-up, a session SAP replaced is followed by a logon, not by another take-up', async () => {
    const { session } = await leftover();
    const s = await start(['--deferred-logon', '--restore-session']);
    try {
      const read = await s.call('GetAdtTypes');
      assert.equal(read.isError, false, read.text);
      // Another process's session left since: a take-up would claim it.
      const later = await leftover();
      standIn.endSession(session);
      // The call that meets the replaced session answers it; the next one
      // builds the connection again.
      await s.call('GetAdtTypes');
      const from = standIn.requests.length;
      const rebuilt = await s.call('GetAdtTypes');
      assert.equal(rebuilt.isError, false, rebuilt.text);
      assert.equal(sessionsSince(from).has(later.session), false);
      assert.equal(writerOf(later.handle), 111);
    } finally {
      await s.stop();
    }
  });
});
