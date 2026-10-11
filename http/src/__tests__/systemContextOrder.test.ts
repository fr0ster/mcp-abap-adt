/**
 * Who creates objects (responsible) and on which system (master system), per
 * request, over Streamable HTTP. Each its own variable first: the request's
 * `x-sap-responsible` / `x-sap-master-system` headers; the process
 * environment. Then, for the responsible only, the login: the request's
 * `x-sap-login`, the process `SAP_USERNAME`. Each request sees its own
 * values — two concurrent requests never see each other's.
 */

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// The connector, without a wire.
jest.mock('../../../src/lib/connectionFactory', () => ({
  ...jest.requireActual('../../../src/lib/connectionFactory'),
  createAbapConnection: () => ({ connect: async () => {} }),
}));

import type { IHttpApplication } from '@mcp-abap-adt/lib/embeddable';
import {
  CompositeHandlersRegistry,
  type HandlerEntry,
  type IHandlerGroup,
} from '@mcp-abap-adt/lib/handlers';
import express from 'express';
import {
  getEffectiveSystemContext,
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
        const seen = getEffectiveSystemContext();
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

/** A token connection: the credential every request must carry, stating no login. */
const TOKEN = {
  'x-sap-url': 'https://system.example.invalid',
  'x-sap-jwt-token': 'token-placeholder',
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
      result: { content: { text: string }[] };
    };
    return JSON.parse(body.result.content[0].text);
  }

  it('the headers win over the process environment', async () => {
    await expect(
      ask({ ...TOKEN, 'x-sap-responsible': 'HEADER_USER' }),
    ).resolves.toEqual({
      responsible: 'HEADER_USER',
      masterSystem: 'PROCESS_SYS',
    });
    await expect(
      ask({ ...TOKEN, 'x-sap-master-system': 'HEADER_SYS' }),
    ).resolves.toEqual({
      responsible: 'PROCESS_USER',
      masterSystem: 'HEADER_SYS',
    });
    await expect(ask(TOKEN)).resolves.toEqual({
      responsible: 'PROCESS_USER',
      masterSystem: 'PROCESS_SYS',
    });
  });

  it('two concurrent requests with different headers each see their own', async () => {
    const [a, b] = await Promise.all([
      ask(
        { ...TOKEN, 'x-sap-responsible': 'FIRST', 'x-sap-master-system': 'S1' },
        1,
        60,
      ),
      ask(
        {
          ...TOKEN,
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

    it('a token connection states no login: the process SAP_USERNAME', async () => {
      delete process.env.SAP_RESPONSIBLE;
      process.env.SAP_USERNAME = 'PROCESS_LOGIN';
      await expect(
        ask({ ...TOKEN, 'x-sap-login': 'HEADER_LOGIN' }),
      ).resolves.toEqual({
        responsible: 'PROCESS_LOGIN',
        masterSystem: 'PROCESS_SYS',
      });
    });
  });
});
