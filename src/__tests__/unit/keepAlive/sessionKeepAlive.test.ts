/**
 * The session keep-alive (24.0.1), through the server: the connection the
 * instance builds is wrapped (`withSessionKeepAlive`), and pinged — one
 * stateless `GET` of the ADT discovery — once no request has gone over it
 * for the whole interval; an injected connection never. The wrapper alone,
 * on a fake connection: `connectionWrapper.test.ts`.
 *
 * Against the ADT stand-in, which records each request and the ABAP session
 * it ran in, through an in-memory MCP session. The clock is node:test's
 * `mock.timers` (`setTimeout`): the keep-alive's timer is armed under it,
 * and `tick` moves it; the stand-in's sockets run on the real loop, waited
 * for with `setImmediate`, never a timer.
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
} from '../../../lib/sessionKeepAlive';
import {
  type AdtStandIn,
  adtStandIn,
  isLogoff,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { McpSession } from '../../integration/helpers/testers/hardMode';

const MINUTE = 60_000;
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

const group: IHandlerGroup = {
  getName: () => 'keep-alive',
  registerHandlers: () => {},
  getHandlers: () => [touch, lose],
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
    mock.timers.reset();
    if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previousType;
  });

  it('pings the held connection after 10 idle minutes, in its session', async () => {
    const s = await stand();
    try {
      await call(s, 'a');
      mock.timers.tick(INTERVAL - 1);
      await settle();
      assert.equal(pings(s.standIn).length, 0, 'not before the interval');
      mock.timers.tick(1);
      await until(() => pings(s.standIn).length === 1);
      const [ping] = pings(s.standIn);
      assert.equal(ping?.session, touchOf(s.standIn, 'a')?.session);
      // The next one after a whole interval more.
      await settle();
      mock.timers.tick(INTERVAL - 1);
      await settle();
      assert.equal(pings(s.standIn).length, 1);
      mock.timers.tick(1);
      await until(() => pings(s.standIn).length === 2);
    } finally {
      await s.close();
    }
  });

  it('sends no ping while calls keep coming', async () => {
    const s = await stand();
    try {
      for (let i = 0; i < 12; i += 1) {
        await call(s, `c${i}`);
        mock.timers.tick(5 * MINUTE);
        await settle();
      }
      assert.equal(pings(s.standIn).length, 0);
    } finally {
      await s.close();
    }
  });

  it('a call resets the clock', async () => {
    const s = await stand();
    try {
      await call(s, 'first');
      mock.timers.tick(9 * MINUTE);
      await call(s, 'second');
      mock.timers.tick(MINUTE);
      await settle();
      assert.equal(pings(s.standIn).length, 0, 'ten minutes after the first');
      mock.timers.tick(9 * MINUTE - 1);
      await settle();
      assert.equal(pings(s.standIn).length, 0);
      mock.timers.tick(1);
      await until(() => pings(s.standIn).length === 1);
    } finally {
      await s.close();
    }
  });

  it('0 turns it off', async () => {
    const s = await stand({ sessionKeepAliveMs: 0 });
    try {
      await call(s, 'a');
      mock.timers.tick(24 * 60 * MINUTE);
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

  it('pings nothing after the terminal close', async () => {
    const s = await stand();
    try {
      await call(s, 'a');
      await s.server.terminalClose();
      mock.timers.tick(3 * INTERVAL);
      await settle();
      assert.equal(pings(s.standIn).length, 0);
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

  it('never pings while a tool call’s request is in flight; its end re-arms it', async () => {
    const s = await stand();
    try {
      await call(s, 'a');
      mock.timers.tick(5 * MINUTE);
      const held = s.standIn.hold((r) => r.url === `${TOUCH_PATH}long`);
      const running = call(s, 'long');
      await held.arrived;
      mock.timers.tick(3 * INTERVAL);
      await settle();
      assert.equal(pings(s.standIn).length, 0, 'none while the call runs');
      held.release();
      await running;
      const ended = s.standIn.requests.length;
      mock.timers.tick(INTERVAL - 1);
      await settle();
      assert.equal(pings(s.standIn).length, 0);
      mock.timers.tick(1);
      await until(() => pings(s.standIn).length === 1);
      const at = s.standIn.requests.findIndex(isPing);
      assert.ok(at >= ended, 'the ping came after the call');
    } finally {
      await s.close();
    }
  });

  it('a failed ping is logged at debug with its status, and not retried', async () => {
    const s = await stand();
    try {
      await call(s, 'a');
      s.standIn.answer(isPing, 500);
      mock.timers.tick(INTERVAL);
      await until(() =>
        s.debug.some((line) =>
          line.startsWith(SESSION_KEEP_ALIVE_FAILED_WORDS),
        ),
      );
      await settle();
      assert.equal(pings(s.standIn).length, 1, 'sent once');
      const lines = s.debug.filter((line) =>
        line.startsWith(SESSION_KEEP_ALIVE_FAILED_WORDS),
      );
      assert.deepEqual(lines, [
        `${SESSION_KEEP_ALIVE_FAILED_WORDS}: status 500`,
      ]);
      mock.timers.tick(INTERVAL - 1);
      await settle();
      assert.equal(pings(s.standIn).length, 1, 'no retry inside the interval');
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
    // An interval no other timer of the process uses, so its timers are told apart.
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
      await call(s, 'c');
      assert.ok(armed.length >= 1, 'armed');
      const live = armed.filter((timer) => !cleared.has(timer));
      assert.equal(live.length, 1, 'exactly one armed at a time');
      for (const timer of armed) assert.equal(timer.hasRef(), false);
      await s.server.terminalClose();
      assert.equal(
        armed.filter((timer) => !cleared.has(timer)).length,
        0,
        'the close cleared it',
      );
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
