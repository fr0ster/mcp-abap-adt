/**
 * Streamable HTTP takes credentials only from each request's `x-sap-*`
 * headers, through lib's `headerSource`, on a new instance
 * or the pooled one its `state_handle` names. Every case goes over real HTTP
 * to a real connection against an ADT stand-in, which records the
 * `Authorization` each call put on the wire.
 */

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IHttpApplication } from '@mcp-abap-adt/lib/embeddable';
import {
  CompositeHandlersRegistry,
  type HandlerEntry,
} from '@mcp-abap-adt/lib/handlers';
import {
  CREDENTIALS_REQUIRED_WORDS,
  DESTINATIONS_ONLY_STDIO_WORDS,
} from '@mcp-abap-adt/lib/http-transport';
import type { InstanceState, StatePart } from '@mcp-abap-adt/lib/state';
import express from 'express';
import {
  type AdtStandIn,
  adtStandIn,
  basicOf,
  PROBE_PATH,
  probeGroup,
} from '../../../../src/__tests__/helpers/adtStandIn';
import { StreamableHttpServer } from '../StreamableHttpServer.js';

/** A part that holds the instance's state: the pool keeps the instance. */
class HeldPart implements StatePart {
  holdsState() {
    return true;
  }
  pending() {
    return false;
  }
  failures() {
    return [];
  }
  async dispose() {}
  observe() {}
}

type Ctx = {
  state: InstanceState;
  connection: { makeAdtRequest(o: object): Promise<unknown> };
};

/** `HoldAndProbe { id }`: holds state, probes, answers the handle. `HeldProbe { id, state_handle }`: on that instance only. */
const heldTools: HandlerEntry[] = [
  {
    toolDefinition: {
      name: 'HoldAndProbe',
      description: 'holds state and probes',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    } as never,
    handler: (async (ctx: Ctx, args: { id: string }) => {
      ctx.state.attach(new HeldPart());
      await ctx.connection.makeAdtRequest({
        url: `${PROBE_PATH}${args.id}`,
        method: 'GET',
        timeout: 10_000,
      });
      return { content: [{ type: 'text', text: ctx.state.handle }] };
    }) as never,
  },
  {
    toolDefinition: {
      name: 'HeldProbe',
      description: 'probes on the instance the handle names',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          state_handle: { type: 'string' },
        },
        required: ['id', 'state_handle'],
      },
    } as never,
    handler: (async (ctx: Ctx, args: { id: string; state_handle: string }) => {
      ctx.state.check(args.state_handle);
      await ctx.connection.makeAdtRequest({
        url: `${PROBE_PATH}${args.id}`,
        method: 'GET',
        timeout: 10_000,
      });
      return { content: [{ type: 'text', text: args.id }] };
    }) as never,
  },
];

const registry = new CompositeHandlersRegistry([probeGroup(heldTools)]);

let standIn: AdtStandIn;
let server: Server;
let mcp: StreamableHttpServer;
let baseUrl: string;
let previousType: string | undefined;
let errorSpy: jest.SpyInstance;

beforeEach(async () => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem'; // no system lookup
  standIn = await adtStandIn();
  mcp = new StreamableHttpServer(registry, {});
  const app = express();
  app.use(express.json());
  mcp.registerRoutes(app as unknown as IHttpApplication);
  server = await new Promise<Server>((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await mcp.stop().catch(() => undefined);
  await new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
  await standIn.close();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
  errorSpy.mockRestore();
});

const basic = (user: string, password: string) => ({
  'x-sap-url': standIn.url,
  'x-sap-client': '100',
  'x-sap-login': user,
  'x-sap-password': password,
});
const token = (value: string) => ({
  'x-sap-url': standIn.url,
  'x-sap-jwt-token': value,
});

let nextId = 1;
function post(headers: Record<string, string>, body: object) {
  return fetch(`${baseUrl}/mcp/stream/http`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, ...body }),
  });
}

async function call(
  headers: Record<string, string>,
  name: string,
  args: object,
): Promise<{ text: string; isError: boolean }> {
  const res = await post(headers, {
    method: 'tools/call',
    params: { name, arguments: args },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    result: { content: { text: string }[]; isError?: boolean };
  };
  return {
    text: body.result.content[0].text,
    isError: !!body.result.isError,
  };
}

describe('the credential comes from the request headers', () => {
  it('x-sap-* basic reaches the stand-in as that user', async () => {
    const r = await call(basic('USER_A', 'pass-a'), 'ProbeAdt', { id: 'b1' });
    expect(r).toEqual({ text: 'b1', isError: false });
    expect(standIn.authorizationOf('b1')).toBe(basicOf('USER_A', 'pass-a'));
  });

  it('x-sap-jwt-token reaches the stand-in as that Bearer token', async () => {
    const r = await call(token('token-a.payload.sig'), 'ProbeAdt', {
      id: 't1',
    });
    expect(r).toEqual({ text: 't1', isError: false });
    expect(standIn.authorizationOf('t1')).toBe('Bearer token-a.payload.sig');
  });
});

describe('a request the server does not serve', () => {
  it.each([
    ['initialize', { method: 'initialize', params: {} }],
    [
      'tools/call',
      {
        method: 'tools/call',
        params: { name: 'ProbeAdt', arguments: { id: 'x' } },
      },
    ],
  ])('%s without credentials: 400 with its sentence', async (_name, body) => {
    const res = await post({}, body);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(CREDENTIALS_REQUIRED_WORDS);
    expect(standIn.requests).toEqual([]);
  });

  it.each([
    ['with credentials', () => basic('USER_A', 'pass-a')],
    ['without credentials', () => ({})],
  ])(
    'x-mcp-destination %s: 400 with its sentence, nothing sent',
    async (_label, headers) => {
      const res = await post(
        { ...headers(), 'x-mcp-destination': 'TRIAL' },
        {
          method: 'tools/call',
          params: { name: 'ProbeAdt', arguments: { id: 'd1' } },
        },
      );
      expect(res.status).toBe(400);
      expect(await res.text()).toBe(DESTINATIONS_ONLY_STDIO_WORDS);
      expect(standIn.requests).toEqual([]);
    },
  );

  it('ping without credentials answers', async () => {
    const res = await post({}, { method: 'ping' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { result: unknown }).result).toEqual({});
  });
});

describe('nothing is shared across requests', () => {
  it('two concurrent requests with different users never see each other’s credential', async () => {
    const [a, b] = await Promise.all([
      call(basic('USER_A', 'pass-a'), 'ProbeAdt', { id: 'ca', delayMs: 80 }),
      call(basic('USER_B', 'pass-b'), 'ProbeAdt', { id: 'cb', delayMs: 0 }),
    ]);
    expect(a.isError || b.isError).toBe(false);
    expect(standIn.authorizationOf('ca')).toBe(basicOf('USER_A', 'pass-a'));
    expect(standIn.authorizationOf('cb')).toBe(basicOf('USER_B', 'pass-b'));
  });

  it("a call routed by state_handle to a kept instance builds its connection from its own headers, not the instance's first request", async () => {
    const held = await call(basic('USER_A', 'pass-a'), 'HoldAndProbe', {
      id: 'h1',
    });
    expect(held.isError).toBe(false);
    const handle = held.text;
    expect(standIn.authorizationOf('h1')).toBe(basicOf('USER_A', 'pass-a'));

    const routed = await call(basic('USER_B', 'pass-b'), 'HeldProbe', {
      id: 'h2',
      state_handle: handle,
    });
    expect(routed).toEqual({ text: 'h2', isError: false });
    expect(standIn.authorizationOf('h2')).toBe(basicOf('USER_B', 'pass-b'));

    const asToken = await call(token('token-c.payload.sig'), 'HeldProbe', {
      id: 'h3',
      state_handle: handle,
    });
    expect(asToken).toEqual({ text: 'h3', isError: false });
    expect(standIn.authorizationOf('h3')).toBe('Bearer token-c.payload.sig');
  });
});
