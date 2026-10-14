/**
 * Who creates objects (responsible) and on which system (master system), per
 * request, over Streamable HTTP, where an on-premise system has no
 * systeminformation (a 404). Each its own variable first: the request's
 * `x-sap-responsible` / `x-sap-master-system` headers; the process
 * environment. Then, for the responsible only, the login: the request's
 * `x-sap-login`. Each request sees its own values — two concurrent requests
 * never see each other's. Such a system names no user, so the request must
 * state one (`x-sap-login` of a basic connection): a token connection states
 * none and is refused `system_user_unknown` before its tool.
 */

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// The connector, without a wire: an on-premise system without
// systeminformation (its lookup answers 404), so the configured order below
// applies — where the system names its user, its answer wins over all of it.
jest.mock('../../../src/lib/connectionFactory', () => ({
  ...jest.requireActual('../../../src/lib/connectionFactory'),
  createAbapConnection: () => ({
    connect: async () => {},
    makeAdtRequest: async () => {
      throw Object.assign(new Error('Request failed with status code 404'), {
        response: { status: 404 },
      });
    },
  }),
}));

import type { IHttpApplication } from '@mcp-abap-adt/lib/embeddable';
import {
  CompositeHandlersRegistry,
  type HandlerEntry,
  type IHandlerGroup,
} from '@mcp-abap-adt/lib/handlers';
import express from 'express';
import {
  getStatedSystemContext,
  resetSystemContextCache,
} from '../../../src/lib/systemContext';
import { StreamableHttpServer } from '../StreamableHttpServer.js';

/** One tool: waits `delayMs`, then answers the context its call sees. */
const whoAmI: IHandlerGroup = {
  getName: () => 'who',
  registerHandlers: () => {},
  getHandlers: (): HandlerEntry[] => [
    {
      toolDefinition: {
        name: 'WhoAmI',
        description: 'reports the context',
        inputSchema: {
          type: 'object',
          properties: { delayMs: { type: 'number' } },
        },
      } as never,
      handler: (async (_context: unknown, args: { delayMs?: number }) => {
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
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  for (const key of PROCESS_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.SAP_RESPONSIBLE = 'PROCESS_USER';
  process.env.SAP_MASTER_SYSTEM = 'PROCESS_SYS';
  resetSystemContextCache();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  errorSpy.mockRestore();
  for (const key of PROCESS_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

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

describe('StreamableHttpServer: responsible and master system per request', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    // A token connection is cloud by default: onprem, so nothing is looked up.
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const mcp = new StreamableHttpServer(registry, {});
    ({ server, baseUrl } = await listen((app) => mcp.registerRoutes(app)));
  });
  afterEach(() => close(server));

  async function ask(
    headers: Record<string, string>,
    id = 1,
    delayMs = 0,
  ): Promise<Seen> {
    return JSON.parse((await answer(headers, id, delayMs)).text);
  }

  async function answer(
    headers: Record<string, string>,
    id = 1,
    delayMs = 0,
  ): Promise<{ text: string; isError: boolean }> {
    const res = await fetch(`${baseUrl}/mcp/stream/http`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify(call(id, delayMs)),
    });
    const body = (await res.json()) as {
      result: { content: { text: string }[]; isError?: boolean };
    };
    return {
      text: body.result.content[0].text,
      isError: body.result.isError === true,
    };
  }

  it('the headers win over the process environment', async () => {
    await expect(
      ask({ ...BASIC, 'x-sap-responsible': 'HEADER_USER' }),
    ).resolves.toEqual({
      responsible: 'HEADER_USER',
      masterSystem: 'PROCESS_SYS',
    });
    await expect(
      ask({ ...BASIC, 'x-sap-master-system': 'HEADER_SYS' }),
    ).resolves.toEqual({
      responsible: 'PROCESS_USER',
      masterSystem: 'HEADER_SYS',
    });
    await expect(ask(BASIC)).resolves.toEqual({
      responsible: 'PROCESS_USER',
      masterSystem: 'PROCESS_SYS',
    });
  });

  it('two concurrent requests with different headers each see their own', async () => {
    const [a, b] = await Promise.all([
      ask(
        { ...BASIC, 'x-sap-responsible': 'FIRST', 'x-sap-master-system': 'S1' },
        1,
        60,
      ),
      ask(
        {
          ...BASIC,
          'x-sap-responsible': 'SECOND',
          'x-sap-master-system': 'S2',
        },
        2,
        0,
      ),
    ]);
    expect(a).toEqual({ responsible: 'FIRST', masterSystem: 'S1' });
    expect(b).toEqual({ responsible: 'SECOND', masterSystem: 'S2' });
  });

  describe('the login, when no SAP_RESPONSIBLE / x-sap-responsible is stated', () => {
    const direct = {
      'x-sap-url': 'https://system.example.invalid',
      'x-sap-login': 'HEADER_LOGIN',
      'x-sap-password': 'placeholder-password',
    };

    it('x-sap-login beats the process SAP_USERNAME; SAP_RESPONSIBLE beats x-sap-login', async () => {
      process.env.SAP_USERNAME = 'PROCESS_LOGIN';
      await expect(ask(direct)).resolves.toEqual({
        responsible: 'PROCESS_USER',
        masterSystem: 'PROCESS_SYS',
      });
      delete process.env.SAP_RESPONSIBLE;
      delete process.env.SAP_MASTER_SYSTEM;
      resetSystemContextCache();
      await expect(ask(direct)).resolves.toEqual({
        responsible: 'HEADER_LOGIN',
        masterSystem: null,
      });
    });

    it('a stated x-sap-responsible is the user on the second step, with or without a login; the login only when none is stated', async () => {
      delete process.env.SAP_RESPONSIBLE;
      delete process.env.SAP_MASTER_SYSTEM;
      resetSystemContextCache();
      // (a) responsible only: a token connection states no login.
      await expect(
        ask({
          ...TOKEN,
          'x-sap-responsible': 'HEADER_RESP',
          'x-sap-master-system': 'HEADER_SYS',
        }),
      ).resolves.toEqual({
        responsible: 'HEADER_RESP',
        masterSystem: 'HEADER_SYS',
      });
      // (b) login only.
      await expect(ask(direct)).resolves.toEqual({
        responsible: 'HEADER_LOGIN',
        masterSystem: null,
      });
      // (c) both: the responsible.
      await expect(
        ask({ ...direct, 'x-sap-responsible': 'HEADER_RESP' }),
      ).resolves.toEqual({ responsible: 'HEADER_RESP', masterSystem: null });
      // (d) neither.
      const refused = await answer(TOKEN);
      expect(refused.isError).toBe(true);
      expect(JSON.parse(refused.text)).toMatchObject({
        error: 'system_user_unknown',
      });
    });

    it.each([
      ['a token connection', TOKEN],
      [
        'a token connection with x-sap-login (it logs nobody on)',
        { ...TOKEN, 'x-sap-login': 'HEADER_LOGIN' },
      ],
    ])(
      '%s states no user: system_user_unknown, the tool not run — the process SAP_USERNAME does not stand in',
      async (_case, headers) => {
        delete process.env.SAP_RESPONSIBLE;
        process.env.SAP_USERNAME = 'PROCESS_LOGIN';
        const refused = await answer(headers);
        expect(refused.isError).toBe(true);
        expect(JSON.parse(refused.text)).toMatchObject({
          error: 'system_user_unknown',
        });
      },
    );
  });
});
