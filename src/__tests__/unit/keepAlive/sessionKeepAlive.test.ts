/**
 * The session keep-alive (24.0.1): one background timer per server ticks
 * every interval — a `setTimeout` re-armed once the tick's ping settled —, and a tick that finds no request on the connection the
 * server built and holds since the previous tick sends one `GET` of the
 * ADT discovery through it.
 *
 * Against the ADT stand-in, which records each request and the ABAP session
 * it ran in, through an in-memory MCP session. The clock is node:test's
 * `mock.timers` (`setTimeout`), enabled before the server is built; the
 * stand-in's sockets run on the real loop, waited for with `setImmediate`.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as z from 'zod';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { createAbapConnection } from '../../../lib/connectionFactory';
import type {
  HandlerEntry,
  IHandlerGroup,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { endConnection } from '../../../lib/ownedConnections';
import {
  SESSION_KEEP_ALIVE_FAILED_WORDS,
  SESSION_KEEP_ALIVE_URL,
  sendSessionKeepAlive,
} from '../../../lib/sessionKeepAlive';
import {
  type AdtStandIn,
  adtStandIn,
  isLogoff,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { McpSession } from '../../integration/helpers/testers/hardMode';

const MINUTE = 60_000;
/** The default interval: 10 minutes. */
const INTERVAL = 10 * MINUTE;
const TOUCH_PATH = '/sap/bc/adt/probe/';

/** The connection the last `Touch` ran on. */
let touched: IAbapConnection | undefined;

/** `Touch { id }`: one `GET <probe>/<id>` on its connection, no wait. */
const touch: HandlerEntry = {
  toolDefinition: {
    name: 'Touch',
    description: 'sends one request on its connection',
    inputSchema: z.object({ id: z.string() }),
  },
  call: (async (
    context: { connection: IAbapConnection },
    args: { id: string },
  ) => {
    touched = context.connection;
    await context.connection.makeAdtRequest({
      url: `${TOUCH_PATH}${args.id}`,
      method: 'GET',
      timeout: 0,
    });
    return { content: [{ type: 'text', text: args.id }] };
  }) as never,
} as unknown as HandlerEntry;

/** `Lose {}`: its connection's session is gone, as SAP's answer would mark it. */
const lose: HandlerEntry = {
  toolDefinition: {
    name: 'Lose',
    description: 'marks its connection spent',
    inputSchema: z.object({}),
  },
  call: (async (context: { connection: { isConnected?: () => boolean } }) => {
    context.connection.isConnected = () => false;
    return { content: [{ type: 'text', text: 'lost' }] };
  }) as never,
} as unknown as HandlerEntry;

/** `Stateful {}`: leaves its connection in the stateful mode, as a held lock does. */
const stateful: HandlerEntry = {
  toolDefinition: {
    name: 'Stateful',
    description: 'leaves its connection stateful',
    inputSchema: z.object({}),
  },
  call: (async (context: { connection: IAbapConnection }) => {
    context.connection.setSessionType('stateful');
    return { content: [{ type: 'text', text: 'stateful' }] };
  }) as never,
} as unknown as HandlerEntry;

/** `Twice { id }`: two requests on its connection, `<probe>/<id>-1` then `-2`. */
const twice: HandlerEntry = {
  toolDefinition: {
    name: 'Twice',
    description: 'sends two requests on its connection',
    inputSchema: z.object({ id: z.string() }),
  },
  call: (async (
    context: { connection: IAbapConnection },
    args: { id: string },
  ) => {
    for (const n of [1, 2]) {
      await context.connection.makeAdtRequest({
        url: `${TOUCH_PATH}${args.id}-${n}`,
        method: 'GET',
        timeout: 0,
      });
    }
    return { content: [{ type: 'text', text: args.id }] };
  }) as never,
} as unknown as HandlerEntry;

const group: IHandlerGroup = {
  getName: () => 'keep-alive',
  registerHandlers: () => {},
  getHandlers: () => [touch, lose, stateful, twice],
} as unknown as IHandlerGroup;

class KeepAliveServer extends BaseMcpServer {
  build(standIn: AdtStandIn): void {
    this.setConnectionContext({
      kind: 'built',
      source: {
        resolve: async () => ({
          settings: {
            url: standIn.url,
            client: '100',
            authType: 'basic',
            username: 'KA_USER',
          },
          credential: new BasicAuthProvider('KA_USER', 'ka-password'),
        }),
      },
    });
  }
  inject(connection: IAbapConnection): void {
    this.setConnectionContext({
      kind: 'injected',
      connection,
      system: 'ka-system',
    });
  }
  register(): void {
    this.registerHandlers(new CompositeHandlersRegistry([group]));
  }
}

interface Stand {
  standIn: AdtStandIn;
  server: KeepAliveServer;
  session: McpSession;
  debug: string[];
  close(): Promise<void>;
}

async function stand(
  options: { sessionKeepAliveMs?: number; source?: 'built' | 'injected' } = {},
): Promise<Stand> {
  const standIn = await adtStandIn();
  const debug: string[] = [];
  const server = new KeepAliveServer({
    name: 'keep-alive',
    systemType: 'onprem',
    logger: {
      info() {},
      debug: (message: string) => {
        debug.push(message);
      },
      warn() {},
      error() {},
    },
    ...(options.sessionKeepAliveMs !== undefined && {
      sessionKeepAliveMs: options.sessionKeepAliveMs,
    }),
  });
  let injected: IAbapConnection | undefined;
  if (options.source === 'injected') {
    injected = createAbapConnection(
      {
        url: standIn.url,
        client: '100',
        authType: 'basic',
        username: 'KA_USER',
      },
      new BasicAuthProvider('KA_USER', 'ka-password'),
      undefined,
      undefined,
      undefined,
      'onprem',
    );
    await injected.connect();
    server.inject(injected);
  } else {
    server.build(standIn);
  }
  server.register();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const session = new McpSession(clientSide);
  await server.connect(serverSide);
  await session.initialize();
  return {
    standIn,
    server,
    session,
    debug,
    close: async () => {
      await session.close();
      await server.terminalClose();
      if (injected !== undefined) await endConnection(injected);
      await standIn.close();
    },
  };
}

const isPing = (request: StandInRequest): boolean =>
  request.method === 'GET' && request.url === SESSION_KEEP_ALIVE_URL;

const pings = (standIn: AdtStandIn): StandInRequest[] =>
  standIn.requests.filter(isPing);

/** Lets the real loop run: sockets, the server's answers. No timer. */
async function settle(turns = 50): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/** Waits on the real loop until `done` holds; fails after `turns` turns. */
async function until(done: () => boolean, turns = 5_000): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    if (done()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('the condition never held');
}

/**
 * Counts the keep-alive's arms on the fake clock: `setTimeout` calls with
 * the interval, through the mocked `setTimeout` (installed after it).
 */
function countArms(): { count(): number } {
  let arms = 0;
  const mocked = globalThis.setTimeout;
  mock.method(globalThis, 'setTimeout', (fn: () => void, ms?: number) => {
    if (ms === INTERVAL) arms += 1;
    return mocked(fn, ms);
  });
  return { count: () => arms };
}

async function call(s: Stand, id: string): Promise<void> {
  const answer = await s.session.callTool('Touch', { id });
  assert.notEqual(answer.isError, true, `Touch ${id} failed`);
}

const touchOf = (standIn: AdtStandIn, id: string) =>
  standIn.requests.find((r) => r.url === `${TOUCH_PATH}${id}`);

describe('the session keep-alive', () => {
  let previousType: string | undefined;
  beforeEach(() => {
    previousType = process.env.SAP_SYSTEM_TYPE;
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    mock.timers.enable({ apis: ['setTimeout'] });
  });
  afterEach(() => {
    mock.restoreAll();
    mock.timers.reset();
    if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previousType;
  });

  it('pings the held connection after an idle interval, in its session', async () => {
    const s = await stand();
    try {
      await call(s, 'a');
      // The first tick sees the call: no ping.
      mock.timers.tick(INTERVAL);
      await settle();
      assert.equal(pings(s.standIn).length, 0);
      // A whole interval with no request: one ping.
      mock.timers.tick(INTERVAL);
      await until(() => pings(s.standIn).length === 1);
      assert.equal(
        pings(s.standIn)[0]?.session,
        touchOf(s.standIn, 'a')?.session,
      );
      // Still idle: once the ping settled, the next tick pings again.
      await settle();
      mock.timers.tick(INTERVAL);
      await until(() => pings(s.standIn).length === 2);
    } finally {
      await s.close();
    }
  });

  it('sends no ping when a request went out in the interval', async () => {
    const s = await stand();
    try {
      for (let i = 0; i < 6; i += 1) {
        await call(s, `c${i}`);
        mock.timers.tick(INTERVAL);
        await settle();
      }
      assert.equal(pings(s.standIn).length, 0);
    } finally {
      await s.close();
    }
  });

  it('0 turns it off', async () => {
    const s = await stand({ sessionKeepAliveMs: 0 });
    try {
      await call(s, 'a');
      mock.timers.tick(10 * INTERVAL);
      await settle();
      assert.equal(pings(s.standIn).length, 0);
    } finally {
      await s.close();
    }
  });

  it('pings nothing and logs on nowhere before the first call (deferred)', async () => {
    const s = await stand();
    try {
      mock.timers.tick(3 * INTERVAL);
      await settle();
      assert.deepEqual(s.standIn.requests, []);
    } finally {
      await s.close();
    }
  });

  it('pings nothing and logs on nowhere on a spent connection', async () => {
    const s = await stand();
    try {
      await call(s, 'a');
      const answer = await s.session.callTool('Lose', {});
      assert.notEqual(answer.isError, true);
      const before = s.standIn.requests.length;
      mock.timers.tick(3 * INTERVAL);
      await settle();
      assert.equal(pings(s.standIn).length, 0);
      assert.equal(s.standIn.requests.length, before, 'nothing sent');
    } finally {
      await s.close();
    }
  });

  it('pings nothing and logs on nowhere on an ended connection', async () => {
    const s = await stand();
    try {
      await call(s, 'a');
      const connection = touched;
      assert.ok(connection !== undefined);
      await endConnection(connection);
      await until(() => s.standIn.requests.some((r) => isLogoff(r.url)));
      await settle();
      const before = s.standIn.requests.length;
      mock.timers.tick(3 * INTERVAL);
      await settle();
      assert.equal(pings(s.standIn).length, 0);
      assert.equal(s.standIn.requests.length, before, 'nothing sent');
    } finally {
      await s.close();
    }
  });

  it('a ping due while a call runs waits for it in the main flow, and goes stateful', async () => {
    const s = await stand();
    try {
      await call(s, 'a');
      const held = s.standIn.hold((r) => r.url === `${TOUCH_PATH}long`);
      const running = call(s, 'long');
      await held.arrived;
      // The first tick sees the call's request; the second finds nothing
      // new and is due while the call still runs: it waits for its turn.
      mock.timers.tick(INTERVAL);
      await settle();
      mock.timers.tick(INTERVAL);
      await settle();
      assert.equal(pings(s.standIn).length, 0, 'not beside the running call');
      held.release();
      await running;
      await until(() => pings(s.standIn).length === 1);
      const ping = pings(s.standIn)[0];
      // Into the connection's stateful session, its mode put back after.
      assert.equal(ping?.sessionType, 'stateful');
      assert.equal(ping?.session, touchOf(s.standIn, 'a')?.session);
      await settle();
      assert.equal(touched?.getSessionMode?.(), 'stateless');
      assert.ok(
        (ping === undefined ? -1 : s.standIn.requests.indexOf(ping)) >
          s.standIn.requests.findIndex((r) => r.url === `${TOUCH_PATH}long`),
      );
    } finally {
      await s.close();
    }
  });

  it('a ping on a connection left stateful keeps it stateful', async () => {
    const s = await stand();
    try {
      await call(s, 'a');
      const answer = await s.session.callTool('Stateful', {});
      assert.notEqual(answer.isError, true);
      mock.timers.tick(INTERVAL);
      await settle();
      mock.timers.tick(INTERVAL);
      await until(() => pings(s.standIn).length === 1);
      assert.equal(pings(s.standIn)[0]?.sessionType, 'stateful');
      await settle();
      assert.equal(touched?.getSessionMode?.(), 'stateful');
    } finally {
      await s.close();
    }
  });

  it('pings an RFC connection after its logon, as an HTTP one', async () => {
    const s = await stand();
    try {
      await call(s, 'a');
      const connection = touched;
      assert.ok(connection !== undefined);
      // The connection states RFC: nothing changes for the keep-alive.
      connection.getConfig = () => ({ connectionType: 'rfc' });
      mock.timers.tick(INTERVAL);
      await settle();
      mock.timers.tick(INTERVAL);
      await until(() => pings(s.standIn).length === 1);
    } finally {
      await s.close();
    }
  });

  it('keeps one tick chain when a connection is born while a ping is pending', async () => {
    const s = await stand();
    try {
      await call(s, 'a');
      mock.timers.tick(INTERVAL);
      await settle();
      const held = s.standIn.hold(isPing);
      const arms = countArms();
      mock.timers.tick(INTERVAL);
      await held.arrived;
      // SAP lost the session: the next call builds a new connection,
      // born while the ping is still pending.
      const first = touched;
      assert.ok(first !== undefined);
      first.isConnected = () => false;
      const next = call(s, 'b');
      // The new connection is born (its connect answered) while the ping
      // holds the main flow.
      const before = s.standIn.requests.length;
      await until(() => s.standIn.requests.length > before);
      await settle(200);
      assert.equal(arms.count(), 0, 'no second chain while the tick runs');
      held.release();
      await next;
      await settle();
      assert.equal(arms.count(), 1, 'the tick re-arms once');
    } finally {
      await s.close();
    }
  });

  it('the close aborts a pending ping, and nothing arms again', async () => {
    const s = await stand();
    const held = s.standIn.hold(isPing);
    try {
      await call(s, 'a');
      mock.timers.tick(INTERVAL);
      await settle();
      const arms = countArms();
      mock.timers.tick(INTERVAL);
      await held.arrived;
      // The close does not wait for SAP's answer to the ping: the tick ends.
      const closing = s.server.close();
      await settle();
      mock.timers.tick(5 * INTERVAL);
      await settle();
      assert.equal(arms.count(), 0);
      assert.equal(pings(s.standIn).length, 1);
      held.release();
      await closing;
    } finally {
      held.release();
      await s.close();
    }
  });

  it('puts the session mode back even when switching to stateful throws', async () => {
    const s = await stand();
    try {
      await call(s, 'a');
      const connection = touched;
      assert.ok(connection !== undefined);
      const set = connection.setSessionType.bind(connection);
      const asked: string[] = [];
      connection.setSessionType = (type) => {
        asked.push(type);
        // The setter's logger throws on the switch to stateful.
        if (type === 'stateful') throw new Error('the setter threw');
        set(type);
      };
      mock.timers.tick(INTERVAL);
      await settle();
      mock.timers.tick(INTERVAL);
      await until(() => asked.length >= 2);
      assert.deepEqual(asked, ['stateful', 'stateless']);
      assert.equal(connection.getSessionMode?.(), 'stateless');
    } finally {
      await s.close();
    }
  });

  it('pings no injected connection', async () => {
    const s = await stand({ source: 'injected' });
    try {
      await call(s, 'a');
      mock.timers.tick(3 * INTERVAL);
      await settle();
      assert.equal(pings(s.standIn).length, 0);
    } finally {
      await s.close();
    }
  });

  it('sends no second ping while a slow ping is still pending', async () => {
    const s = await stand();
    try {
      await call(s, 'a');
      mock.timers.tick(INTERVAL);
      await settle();
      const held = s.standIn.hold(isPing);
      const arms = countArms();
      mock.timers.tick(INTERVAL);
      await held.arrived;
      // The slow ping is pending: no tick is armed until it settles.
      mock.timers.tick(5 * INTERVAL);
      await settle();
      assert.equal(pings(s.standIn).length, 1);
      assert.equal(arms.count(), 0, 'not armed while the ping is pending');
      held.release();
      await settle();
      assert.equal(arms.count(), 1, 'armed once it settled');
      mock.timers.tick(INTERVAL);
      await until(() => pings(s.standIn).length === 2);
    } finally {
      await s.close();
    }
  });

  it('a tick running at the close does not arm again', async () => {
    const s = await stand();
    try {
      await call(s, 'a');
      mock.timers.tick(INTERVAL);
      await settle();
      const held = s.standIn.hold(isPing);
      const arms = countArms();
      mock.timers.tick(INTERVAL);
      await held.arrived;
      await s.server.close();
      held.release();
      await settle();
      mock.timers.tick(5 * INTERVAL);
      await settle();
      assert.equal(pings(s.standIn).length, 1);
      assert.equal(arms.count(), 0, 'never armed after the close');
    } finally {
      await s.close();
    }
  });

  it('pings nothing after the server closed', async () => {
    const s = await stand();
    try {
      await call(s, 'a');
      await s.server.close();
      mock.timers.tick(3 * INTERVAL);
      await settle();
      assert.equal(pings(s.standIn).length, 0);
    } finally {
      await s.close();
    }
  });
});

describe('the session keep-alive timer, on the real clock', () => {
  let previousType: string | undefined;
  beforeEach(() => {
    previousType = process.env.SAP_SYSTEM_TYPE;
    process.env.SAP_SYSTEM_TYPE = 'onprem';
  });
  afterEach(() => {
    mock.restoreAll();
    if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previousType;
  });

  it('is one unref’d timer per instance, cleared by the close', async () => {
    // An interval no other timer of the process uses, so its timer is told apart.
    const interval = 7 * MINUTE + 7;
    const armed: Array<ReturnType<typeof setTimeout>> = [];
    const cleared = new Set<unknown>();
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    mock.method(globalThis, 'setTimeout', (fn: () => void, ms?: number) => {
      const timer = realSet(fn, ms);
      if (ms === interval) armed.push(timer);
      return timer;
    });
    mock.method(
      globalThis,
      'clearTimeout',
      (timer: ReturnType<typeof setTimeout> | undefined) => {
        cleared.add(timer);
        realClear(timer);
      },
    );
    const s = await stand({ sessionKeepAliveMs: interval });
    try {
      await call(s, 'a');
      await call(s, 'b');
      assert.equal(armed.length, 1, 'one timer');
      assert.equal(armed[0]?.hasRef(), false, 'unref’d');
      await s.server.close();
      assert.equal(cleared.has(armed[0]), true, 'the close cleared it');
    } finally {
      await s.close();
    }
  });

  it('refuses an interval that is no whole number of milliseconds in range', () => {
    for (const value of [-1, 1.5, 2 ** 31, Number.NaN]) {
      assert.throws(
        () =>
          new KeepAliveServer({
            name: 'keep-alive',
            systemType: 'onprem',
            sessionKeepAliveMs: value,
          }),
        /Invalid sessionKeepAliveMs/,
      );
    }
  });
});

describe('the ping’s failure line', () => {
  it('reads the status from the failure, or from its cause', async () => {
    const lines: string[] = [];
    const logger = {
      info() {},
      warn() {},
      error() {},
      debug: (line: string) => {
        lines.push(line);
      },
    };
    const failing = (thrown: unknown): IAbapConnection =>
      ({
        makeAdtRequest: async () => {
          throw thrown;
        },
      }) as unknown as IAbapConnection;
    await sendSessionKeepAlive(failing({ response: { status: 503 } }), logger);
    await sendSessionKeepAlive(
      failing({ cause: { response: { status: 401 } } }),
      logger,
    );
    await sendSessionKeepAlive(failing(new Error('no status')), logger);
    assert.deepEqual(lines, [
      `${SESSION_KEEP_ALIVE_FAILED_WORDS}: status 503`,
      `${SESSION_KEEP_ALIVE_FAILED_WORDS}: status 401`,
      `${SESSION_KEEP_ALIVE_FAILED_WORDS}: status none`,
    ]);
  });
});
