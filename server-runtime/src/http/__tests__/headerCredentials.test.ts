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
      inputSchema: z.object({ id: z.string() }),
    } as never,
    call: (async (ctx: Ctx, args: { id: string }) => {
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
      inputSchema: z.object({ id: z.string(), state_handle: z.string() }),
    } as never,
    call: (async (ctx: Ctx, args: { id: string; state_handle: string }) => {
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
let errorSpy: Mock<typeof console.error>;

beforeEach(async () => {
  errorSpy = mock.method(console, 'error', () => {});
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
  errorSpy.mock.restore();
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
  assert.equal(res.status, 200);
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
    assert.deepStrictEqual(r, { text: 'b1', isError: false });
    assert.equal(standIn.authorizationOf('b1'), basicOf('USER_A', 'pass-a'));
  });

  it('x-sap-jwt-token reaches the stand-in as that Bearer token', async () => {
    const r = await call(token('token-a.payload.sig'), 'ProbeAdt', {
      id: 't1',
    });
    assert.deepStrictEqual(r, { text: 't1', isError: false });
    assert.equal(standIn.authorizationOf('t1'), 'Bearer token-a.payload.sig');
  });
});

describe('a request the server does not serve', () => {
  for (const [_name, body] of [
    ['initialize', { method: 'initialize', params: {} }],
    [
      'tools/call',
      {
        method: 'tools/call',
        params: { name: 'ProbeAdt', arguments: { id: 'x' } },
      },
    ],
  ] satisfies [string, object][]) {
    it(
      format('%s without credentials: 400 with its sentence', _name),
      async () => {
        const res = await post({}, body);
        assert.equal(res.status, 400);
        assert.equal(await res.text(), CREDENTIALS_REQUIRED_WORDS);
        assert.deepStrictEqual(standIn.requests, []);
      },
    );
  }

  for (const [_label, headers] of [
    ['with credentials', () => basic('USER_A', 'pass-a')],
    ['without credentials', () => ({})],
  ] satisfies [string, () => Record<string, string>][]) {
    it(
      format(
        'x-mcp-destination %s: 400 with its sentence, nothing sent',
        _label,
      ),
      async () => {
        const res = await post(
          { ...headers(), 'x-mcp-destination': 'TRIAL' },
          {
            method: 'tools/call',
            params: { name: 'ProbeAdt', arguments: { id: 'd1' } },
          },
        );
        assert.equal(res.status, 400);
        assert.equal(await res.text(), DESTINATIONS_ONLY_STDIO_WORDS);
        assert.deepStrictEqual(standIn.requests, []);
      },
    );
  }

  it('ping without credentials answers', async () => {
    const res = await post({}, { method: 'ping' });
    assert.equal(res.status, 200);
    assert.deepStrictEqual(
      ((await res.json()) as { result: unknown }).result,
      {},
    );
  });
});

describe('nothing is shared across requests', () => {
  it('two concurrent requests with different users never see each other’s credential', async () => {
    const [a, b] = await Promise.all([
      call(basic('USER_A', 'pass-a'), 'ProbeAdt', { id: 'ca', delayMs: 80 }),
      call(basic('USER_B', 'pass-b'), 'ProbeAdt', { id: 'cb', delayMs: 0 }),
    ]);
    assert.equal(a.isError || b.isError, false);
    assert.equal(standIn.authorizationOf('ca'), basicOf('USER_A', 'pass-a'));
    assert.equal(standIn.authorizationOf('cb'), basicOf('USER_B', 'pass-b'));
  });

  it("a call routed by state_handle to a kept instance builds its connection from its own headers, not the instance's first request", async () => {
    const held = await call(basic('USER_A', 'pass-a'), 'HoldAndProbe', {
      id: 'h1',
    });
    assert.equal(held.isError, false);
    const handle = held.text;
    assert.equal(standIn.authorizationOf('h1'), basicOf('USER_A', 'pass-a'));

    const routed = await call(basic('USER_B', 'pass-b'), 'HeldProbe', {
      id: 'h2',
      state_handle: handle,
    });
    assert.deepStrictEqual(routed, { text: 'h2', isError: false });
    assert.equal(standIn.authorizationOf('h2'), basicOf('USER_B', 'pass-b'));

    const asToken = await call(token('token-c.payload.sig'), 'HeldProbe', {
      id: 'h3',
      state_handle: handle,
    });
    assert.deepStrictEqual(asToken, { text: 'h3', isError: false });
    assert.equal(standIn.authorizationOf('h3'), 'Bearer token-c.payload.sig');
  });
});
