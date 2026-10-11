/**
 * Who creates objects (responsible) and on which system (master system), per
 * session, over SSE. Each its own variable first: the opening request's
 * `x-sap-responsible` / `x-sap-master-system` headers; the process
 * environment. Then, for the responsible only, the login: the opening
 * request's `x-sap-login`, the process `SAP_USERNAME`. Each session sees its
 * own values — two concurrent sessions never see each other's.
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
import { SseServer } from '../SseServer.js';

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

/** A token connection: the credential every session must open with, stating no login. */
const TOKEN = {
  'x-sap-url': 'https://system.example.invalid',
  'x-sap-jwt-token': 'token-placeholder',
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

  it('the opening headers win over the process environment', async () => {
    await expect(
      ask({ ...TOKEN, 'x-sap-responsible': 'HEADER_USER' }),
    ).resolves.toEqual({
      responsible: 'HEADER_USER',
      masterSystem: 'PROCESS_SYS',
    });
    await expect(ask(TOKEN)).resolves.toEqual({
      responsible: 'PROCESS_USER',
      masterSystem: 'PROCESS_SYS',
    });
  });

  it('the login: x-sap-login of a basic connection, else the process SAP_USERNAME', async () => {
    delete process.env.SAP_RESPONSIBLE;
    process.env.SAP_USERNAME = 'PROCESS_LOGIN';
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
    await expect(
      ask({ ...TOKEN, 'x-sap-login': 'HEADER_LOGIN' }),
    ).resolves.toEqual({
      responsible: 'PROCESS_LOGIN',
      masterSystem: 'PROCESS_SYS',
    });
  });

  it('two concurrent sessions each see their own', async () => {
    const [a, b] = await Promise.all([
      ask({ ...TOKEN, 'x-sap-responsible': 'FIRST' }, 60),
      ask({ ...TOKEN, 'x-sap-master-system': 'HDR' }, 0),
    ]);
    expect(a).toEqual({ responsible: 'FIRST', masterSystem: 'PROCESS_SYS' });
    expect(b).toEqual({ responsible: 'PROCESS_USER', masterSystem: 'HDR' });
  });
});
