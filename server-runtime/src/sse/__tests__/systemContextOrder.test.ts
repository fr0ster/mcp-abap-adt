import assert from 'node:assert/strict';
import {
  afterEach,
  beforeEach,
  describe,
  it,
  type Mock,
  mock,
} from 'node:test';
import { format } from 'node:util';
import * as z from 'zod';
import { assertMatchObject } from '../../../../src/__tests__/helpers/assertions';
/**
 * Who creates objects (responsible) and on which system (master system), per
 * session, over SSE, where an on-premise system has no systeminformation
 * (a 404). Each its own variable first: the opening request's
 * `x-sap-responsible` / `x-sap-master-system` headers; the process
 * environment. Then, for the responsible only, the login: the opening
 * request's `x-sap-login`. Each session sees its own values — two
 * concurrent sessions never see each other's. Such a system names no user,
 * so the session must state one (`x-sap-login` of a basic connection): one
 * that states none is refused `system_user_unknown` before its tool. The
 * 404 is kept for the session's destination: its next call sends no lookup.
 */

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// The connector, without a wire: an on-premise system without
// systeminformation (its lookup answers 404), so the configured order below
// applies — where the system names its user, its answer wins over all of it.
// Each lookup is counted.
const mockLookups = { count: 0 };

import type { IHttpApplication } from '@mcp-abap-adt/lib/embeddable';
import {
  CompositeHandlersRegistry,
  type HandlerEntry,
  type IHandlerGroup,
} from '@mcp-abap-adt/lib/handlers';
import express from 'express';
import * as connectionFactory from '../../../../src/lib/connectionFactory';
import {
  getStatedSystemContext,
  resetSystemContextCache,
} from '../../../../src/lib/systemContext';
import { SseServer } from '../SseServer.js';

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time); the names not replaced stay real.
mock.method(connectionFactory, 'createAbapConnection', () => ({
  connect: async () => {},
  makeAdtRequest: async (options: { url?: string }) => {
    if (String(options?.url ?? '').includes('systeminformation')) {
      mockLookups.count += 1;
    }
    throw Object.assign(new Error('Request failed with status code 404'), {
      response: { status: 404 },
    });
  },
}));

/** One tool: waits `delayMs`, then answers the context its call sees. */
const whoAmI: IHandlerGroup = {
  getName: () => 'who',
  registerHandlers: () => {},
  getHandlers: (): HandlerEntry[] => [
    {
      toolDefinition: {
        name: 'WhoAmI',
        description: 'reports the context',
        inputSchema: z.object({ delayMs: z.number().optional() }),
      } as never,
      call: (async (_context: unknown, args: { delayMs?: number }) => {
        await new Promise((r) => setTimeout(r, args?.delayMs ?? 0));
        const seen = getStatedSystemContext();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                responsible: seen.responsible ?? null,
                masterSystem: seen.masterSystem ?? null,
              }),
            },
          ],
        };
      }) as never,
    },
  ],
};
const registry = new CompositeHandlersRegistry([whoAmI]);

/** A token connection: a credential stating no login. */
const TOKEN = {
  'x-sap-url': 'https://system.example.invalid',
  'x-sap-jwt-token': 'token-placeholder',
};

/** A basic connection: its `x-sap-login` states the user. */
const BASIC = {
  'x-sap-url': 'https://system.example.invalid',
  'x-sap-login': 'HEADER_LOGIN',
  'x-sap-password': 'placeholder-password',
};

async function listen(
  register: (app: IHttpApplication) => void,
): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  app.use(express.json());
  register(app as unknown as IHttpApplication);
  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as AddressInfo;
      resolve({ server: srv, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

const call = (id: number, delayMs = 0) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name: 'WhoAmI', arguments: { delayMs } },
});

type Seen = { responsible: string | null; masterSystem: string | null };

const PROCESS_KEYS = [
  'SAP_RESPONSIBLE',
  'SAP_USERNAME',
  'SAP_MASTER_SYSTEM',
  'SAP_SYSTEM_TYPE',
] as const;
const saved: Record<string, string | undefined> = {};
let errorSpy: Mock<typeof console.error>;

beforeEach(() => {
  for (const key of PROCESS_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.SAP_RESPONSIBLE = 'PROCESS_USER';
  process.env.SAP_MASTER_SYSTEM = 'PROCESS_SYS';
  resetSystemContextCache();
  errorSpy = mock.method(console, 'error', () => {});
});
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  errorSpy.mock.restore();
  for (const key of PROCESS_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('SseServer: responsible and master system per session', () => {
  let server: Server;
  let baseUrl: string;
  const controllers: AbortController[] = [];

  beforeEach(async () => {
    // A token connection is cloud by default: onprem, so nothing is looked up.
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const sse = new SseServer(registry, {});
    ({ server, baseUrl } = await listen((app) => sse.registerRoutes(app)));
  });
  afterEach(async () => {
    for (const c of controllers.splice(0)) c.abort();
    await close(server);
  });

  /** Opens a session with these headers, calls the tool once on it. */
  async function ask(
    headers: Record<string, string>,
    delayMs = 0,
  ): Promise<Seen> {
    const answer = await (await session(headers))(delayMs);
    return JSON.parse(answer.text);
  }

  /** Opens a session with these headers; each call answers its result. */
  async function session(
    headers: Record<string, string>,
  ): Promise<
    (delayMs?: number) => Promise<{ text: string; isError: boolean }>
  > {
    const controller = new AbortController();
    controllers.push(controller);
    const res = await fetch(`${baseUrl}/sse`, {
      headers,
      signal: controller.signal,
    });
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const nextData = async (event: string): Promise<string> => {
      for (;;) {
        const match = buffer.match(
          new RegExp(`event: ${event}\\r?\\ndata: (.*)\\r?\\n\\r?\\n`),
        );
        if (match) {
          buffer = buffer.slice((match.index ?? 0) + match[0].length);
          return match[1];
        }
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended');
        buffer += decoder.decode(value, { stream: true });
      }
    };
    const endpoint = await nextData('endpoint');
    let id = 1;
    return async (delayMs = 0) => {
      await fetch(new URL(endpoint, baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(call(id++, delayMs)),
      });
      const message = JSON.parse(await nextData('message'));
      return {
        text: message.result.content[0].text,
        isError: message.result.isError === true,
      };
    };
  }

  it('the opening headers only: the process environment answers neither (D26 D2)', async () => {
    assert.deepStrictEqual(
      await ask({ ...BASIC, 'x-sap-responsible': 'HEADER_USER' }),
      {
        responsible: 'HEADER_USER',
        masterSystem: null,
      },
    );
    // No responsible header: the basic connection's login stands in.
    assert.deepStrictEqual(await ask(BASIC), {
      responsible: 'HEADER_LOGIN',
      masterSystem: null,
    });
  });

  it('the login: x-sap-login of a basic connection', async () => {
    delete process.env.SAP_RESPONSIBLE;
    process.env.SAP_USERNAME = 'PROCESS_LOGIN';
    assert.deepStrictEqual(await ask(BASIC), {
      responsible: 'HEADER_LOGIN',
      masterSystem: null,
    });
  });

  it('a stated x-sap-responsible is the user on the second step, with or without a login; the login only when none is stated', async () => {
    delete process.env.SAP_RESPONSIBLE;
    delete process.env.SAP_MASTER_SYSTEM;
    resetSystemContextCache();
    // (a) responsible only: a token connection states no login.
    assert.deepStrictEqual(
      await ask({
        ...TOKEN,
        'x-sap-responsible': 'HEADER_RESP',
        'x-sap-master-system': 'HEADER_SYS',
      }),
      {
        responsible: 'HEADER_RESP',
        masterSystem: 'HEADER_SYS',
      },
    );
    // (b) login only.
    assert.deepStrictEqual(await ask(BASIC), {
      responsible: 'HEADER_LOGIN',
      masterSystem: null,
    });
    // (c) both: the responsible.
    assert.deepStrictEqual(
      await ask({ ...BASIC, 'x-sap-responsible': 'HEADER_RESP' }),
      { responsible: 'HEADER_RESP', masterSystem: null },
    );
    // (d) neither.
    const refused = await (await session(TOKEN))();
    assert.equal(refused.isError, true);
    assertMatchObject(JSON.parse(refused.text), {
      error: 'system_user_unknown',
    });
  });

  for (const [_case, headers] of [
    ['a token connection', TOKEN],
    [
      'a token connection with x-sap-login (it logs nobody on)',
      { ...TOKEN, 'x-sap-login': 'HEADER_LOGIN' },
    ],
  ] satisfies [string, Record<string, string>][]) {
    it(
      format(
        '%s states no user: system_user_unknown, the tool not run; the connection fails with its parameters, nothing is kept, so the next call asks again',
        _case,
      ),
      async () => {
        delete process.env.SAP_RESPONSIBLE;
        resetSystemContextCache();
        process.env.SAP_USERNAME = 'PROCESS_LOGIN';
        const before = mockLookups.count;
        const next = await session(headers);
        for (let i = 0; i < 2; i += 1) {
          const answer = await next();
          assert.equal(answer.isError, true);
          assertMatchObject(JSON.parse(answer.text), {
            error: 'system_user_unknown',
          });
        }
        assert.equal(mockLookups.count - before, 2);
      },
    );
  }

  it('a session that states its user: every call runs, asked once (an on-premise 404 is kept)', async () => {
    const before = mockLookups.count;
    const next = await session(BASIC);
    assert.equal((await next()).isError, false);
    assert.equal((await next()).isError, false);
    assert.equal(mockLookups.count - before, 1);
  });

  it('two concurrent sessions each see their own', async () => {
    const [a, b] = await Promise.all([
      ask({ ...BASIC, 'x-sap-responsible': 'FIRST' }, 60),
      ask({ ...BASIC, 'x-sap-master-system': 'HDR' }, 0),
    ]);
    assert.deepStrictEqual(a, { responsible: 'FIRST', masterSystem: null });
    assert.deepStrictEqual(b, {
      responsible: 'HEADER_LOGIN',
      masterSystem: 'HDR',
    });
  });
});
