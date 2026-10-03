/**
 * Who creates objects (responsible) and on which system (master system), per
 * request, over HTTP and SSE. Each its own variable first: the request's
 * `x-sap-responsible` / `x-sap-master-system` headers; the destination's own
 * `.env` (`IDestinations.systemContextFor`); the process environment. Then,
 * for the responsible only, the login: the destination's `SAP_USERNAME`, the
 * request's `x-sap-login`, the process `SAP_USERNAME`. Each request sees its
 * own values — two concurrent requests never see each other's.
 */

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// The connector, without a wire.
jest.mock('../../../src/lib/connectionFactory', () => ({
  ...jest.requireActual('../../../src/lib/connectionFactory'),
  createAbapConnection: () => ({ connect: async () => {} }),
}));

import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import type {
  DestinationSystemContext,
  IDestinations,
} from '@mcp-abap-adt/lib/auth';
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
import { SseServer } from '../SseServer.js';
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

const DESTINATION_CONTEXT: Record<string, DestinationSystemContext> = {
  alpha: { responsible: 'ALPHA_USER', masterSystem: 'ALPHA_SYS' },
  beta: { responsible: 'BETA_USER', masterSystem: 'BETA_SYS' },
  // A basic destination stating no SAP_RESPONSIBLE: its login.
  gamma: { login: 'GAMMA_LOGIN' },
  bare: {},
};

function provider(): IAuthProvider {
  return {
    kind: 'test',
    prepare: async () => ({ ok: true }),
    establish: async () => ({ ok: true }),
    authorize: async () => ({ ok: true }),
    rejected: async () => ({ ok: true }),
  };
}

function destinations(): IDestinations {
  return {
    settingsFor: async () => ({
      url: 'https://system.example.invalid',
      authType: 'basic' as const,
    }),
    getProvider: async () => provider(),
    systemContextFor: async (destination) =>
      DESTINATION_CONTEXT[destination] ?? {},
  };
}

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

describe('StreamableHttpServer: responsible and master system per request', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const mcp = new StreamableHttpServer(registry, destinations(), {
      allowDestinationHeader: true,
      defaultDestination: 'bare',
    });
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

  it('the headers win over the destination .env', async () => {
    await expect(
      ask({
        'x-mcp-destination': 'alpha',
        'x-sap-responsible': 'HEADER_USER',
      }),
    ).resolves.toEqual({
      responsible: 'HEADER_USER',
      masterSystem: 'ALPHA_SYS',
    });
    await expect(
      ask({
        'x-mcp-destination': 'alpha',
        'x-sap-master-system': 'HEADER_SYS',
      }),
    ).resolves.toEqual({
      responsible: 'ALPHA_USER',
      masterSystem: 'HEADER_SYS',
    });
  });

  it('the destination .env wins over the process environment', async () => {
    await expect(ask({ 'x-mcp-destination': 'alpha' })).resolves.toEqual({
      responsible: 'ALPHA_USER',
      masterSystem: 'ALPHA_SYS',
    });
    // A destination that states neither: the process environment.
    await expect(ask({ 'x-mcp-destination': 'bare' })).resolves.toEqual({
      responsible: 'PROCESS_USER',
      masterSystem: 'PROCESS_SYS',
    });
  });

  it('two concurrent requests to different destinations each see their own', async () => {
    const [a, b] = await Promise.all([
      ask({ 'x-mcp-destination': 'alpha' }, 1, 60),
      ask({ 'x-mcp-destination': 'beta' }, 2, 0),
    ]);
    expect(a).toEqual({ responsible: 'ALPHA_USER', masterSystem: 'ALPHA_SYS' });
    expect(b).toEqual({ responsible: 'BETA_USER', masterSystem: 'BETA_SYS' });
  });

  it('two concurrent requests with different headers each see their own', async () => {
    const [a, b] = await Promise.all([
      ask({ 'x-sap-responsible': 'FIRST', 'x-sap-master-system': 'S1' }, 1, 60),
      ask({ 'x-sap-responsible': 'SECOND', 'x-sap-master-system': 'S2' }, 2, 0),
    ]);
    expect(a).toEqual({ responsible: 'FIRST', masterSystem: 'S1' });
    expect(b).toEqual({ responsible: 'SECOND', masterSystem: 'S2' });
  });

  it('x-sap-* credential headers: the headers, else the process environment', async () => {
    const direct = {
      'x-sap-url': 'https://system.example.invalid',
      'x-sap-login': 'placeholder-user',
      'x-sap-password': 'placeholder-password',
    };
    await expect(
      ask({ ...direct, 'x-sap-responsible': 'HEADER_USER' }),
    ).resolves.toEqual({
      responsible: 'HEADER_USER',
      masterSystem: 'PROCESS_SYS',
    });
    await expect(ask(direct)).resolves.toEqual({
      responsible: 'PROCESS_USER',
      masterSystem: 'PROCESS_SYS',
    });
  });

  describe('the login, when no SAP_RESPONSIBLE / x-sap-responsible is stated', () => {
    const direct = {
      'x-sap-url': 'https://system.example.invalid',
      'x-sap-login': 'HEADER_LOGIN',
      'x-sap-password': 'placeholder-password',
    };

    it("the process SAP_RESPONSIBLE beats the destination's login", async () => {
      await expect(ask({ 'x-mcp-destination': 'gamma' })).resolves.toEqual({
        responsible: 'PROCESS_USER',
        masterSystem: 'PROCESS_SYS',
      });
    });

    it("the destination's SAP_USERNAME beats the process SAP_USERNAME", async () => {
      delete process.env.SAP_RESPONSIBLE;
      process.env.SAP_USERNAME = 'PROCESS_LOGIN';
      await expect(ask({ 'x-mcp-destination': 'gamma' })).resolves.toEqual({
        responsible: 'GAMMA_LOGIN',
        masterSystem: 'PROCESS_SYS',
      });
      // A destination stating no login: the process SAP_USERNAME.
      await expect(ask({ 'x-mcp-destination': 'bare' })).resolves.toEqual({
        responsible: 'PROCESS_LOGIN',
        masterSystem: 'PROCESS_SYS',
      });
    });

    it('x-sap-login on a destination request is not the login: only an x-sap-url connection logs on with it', async () => {
      delete process.env.SAP_RESPONSIBLE;
      process.env.SAP_USERNAME = 'PROCESS_LOGIN';
      await expect(
        ask({ 'x-mcp-destination': 'bare', 'x-sap-login': 'HEADER_LOGIN' }),
      ).resolves.toEqual({
        responsible: 'PROCESS_LOGIN',
        masterSystem: 'PROCESS_SYS',
      });
      // The default destination, with a stray x-sap-login and no x-sap-url.
      await expect(ask({ 'x-sap-login': 'HEADER_LOGIN' })).resolves.toEqual({
        responsible: 'PROCESS_LOGIN',
        masterSystem: 'PROCESS_SYS',
      });
    });

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
  });
});

describe('SseServer: responsible and master system per session', () => {
  let server: Server;
  let baseUrl: string;
  const controllers: AbortController[] = [];

  beforeEach(async () => {
    const sse = new SseServer(registry, destinations(), {
      allowDestinationHeader: true,
      defaultDestination: 'bare',
    });
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
    await fetch(new URL(endpoint, baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(call(1, delayMs)),
    });
    const message = JSON.parse(await nextData('message'));
    return JSON.parse(message.result.content[0].text);
  }

  it('the headers win over the destination .env, which wins over the process', async () => {
    await expect(
      ask({ 'x-mcp-destination': 'alpha', 'x-sap-responsible': 'HEADER_USER' }),
    ).resolves.toEqual({
      responsible: 'HEADER_USER',
      masterSystem: 'ALPHA_SYS',
    });
    await expect(ask({ 'x-mcp-destination': 'alpha' })).resolves.toEqual({
      responsible: 'ALPHA_USER',
      masterSystem: 'ALPHA_SYS',
    });
    await expect(ask({})).resolves.toEqual({
      responsible: 'PROCESS_USER',
      masterSystem: 'PROCESS_SYS',
    });
  });

  it("the login: the destination's SAP_USERNAME, x-sap-login, the process SAP_USERNAME", async () => {
    delete process.env.SAP_RESPONSIBLE;
    process.env.SAP_USERNAME = 'PROCESS_LOGIN';
    await expect(ask({ 'x-mcp-destination': 'gamma' })).resolves.toEqual({
      responsible: 'GAMMA_LOGIN',
      masterSystem: 'PROCESS_SYS',
    });
    await expect(
      ask({
        'x-sap-url': 'https://system.example.invalid',
        'x-sap-login': 'HEADER_LOGIN',
        'x-sap-password': 'placeholder-password',
      }),
    ).resolves.toEqual({
      responsible: 'HEADER_LOGIN',
      masterSystem: 'PROCESS_SYS',
    });
    await expect(ask({})).resolves.toEqual({
      responsible: 'PROCESS_LOGIN',
      masterSystem: 'PROCESS_SYS',
    });
  });

  it('x-sap-login on a destination session is not the login', async () => {
    delete process.env.SAP_RESPONSIBLE;
    process.env.SAP_USERNAME = 'PROCESS_LOGIN';
    await expect(
      ask({ 'x-mcp-destination': 'bare', 'x-sap-login': 'HEADER_LOGIN' }),
    ).resolves.toEqual({
      responsible: 'PROCESS_LOGIN',
      masterSystem: 'PROCESS_SYS',
    });
  });

  it('two concurrent sessions to different destinations each see their own', async () => {
    const [a, b] = await Promise.all([
      ask({ 'x-mcp-destination': 'alpha' }, 60),
      ask({ 'x-mcp-destination': 'beta', 'x-sap-master-system': 'HDR' }, 0),
    ]);
    expect(a).toEqual({ responsible: 'ALPHA_USER', masterSystem: 'ALPHA_SYS' });
    expect(b).toEqual({ responsible: 'BETA_USER', masterSystem: 'HDR' });
  });
});
