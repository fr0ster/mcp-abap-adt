/**
 * SSE takes credentials only from the `x-sap-*` headers of the `GET` that
 * opens each connection (D48, spec §4.2), through lib's `headerSource`: one
 * source per connection, shared with no other. A `POST` is routed by its
 * `sessionId` alone — its own `x-sap-*` headers change nothing (ruling 14).
 * Every case goes over real HTTP to a real connection against an ADT
 * stand-in, which records the `Authorization` each call put on the wire.
 */

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IHttpApplication } from '@mcp-abap-adt/lib/embeddable';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import {
  CREDENTIALS_REQUIRED_WORDS,
  DESTINATIONS_ONLY_STDIO_WORDS,
} from '@mcp-abap-adt/lib/http-transport';
import express from 'express';
import {
  type AdtStandIn,
  adtStandIn,
  basicOf,
  probeGroup,
} from '../../../src/__tests__/helpers/adtStandIn';
import { SYSTEM_TYPE_REQUIRED_WORDS } from '../../../src/lib/auth/serverRefusal';
import { SseServer } from '../SseServer.js';

const registry = new CompositeHandlersRegistry([probeGroup()]);

let standIn: AdtStandIn;
let server: Server;
let sse: SseServer;
let baseUrl: string;
let previousType: string | undefined;
let errorSpy: jest.SpyInstance;
const open: AbortController[] = [];

beforeEach(async () => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  standIn = await adtStandIn();
  sse = new SseServer(registry, {});
  const app = express();
  app.use(express.json());
  sse.registerRoutes(app as unknown as IHttpApplication);
  server = await new Promise<Server>((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const controller of open.splice(0)) controller.abort();
  // A connection logs its close after the socket goes; let it.
  await new Promise((resolve) => setTimeout(resolve, 20));
  await sse.stop().catch(() => undefined);
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

/** The data of the next `event: <name>` in an SSE stream, read by plain string search. */
function eventReader(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return async (name: string): Promise<string> => {
    const marker = `event: ${name}\n`;
    for (;;) {
      const at = buffer.indexOf(marker);
      if (at >= 0) {
        const dataAt = buffer.indexOf('data: ', at + marker.length);
        const end = dataAt >= 0 ? buffer.indexOf('\n', dataAt) : -1;
        if (end >= 0) {
          const data = buffer.slice(dataAt + 'data: '.length, end).trim();
          buffer = buffer.slice(end + 1);
          return data;
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('stream ended');
      buffer += decoder.decode(value, { stream: true }).split('\r').join('');
    }
  };
}

let nextId = 1;

/** Opens an SSE connection with `headers`; its POSTs go to its endpoint. */
async function connect(headers: Record<string, string>) {
  const controller = new AbortController();
  open.push(controller);
  const res = await fetch(`${baseUrl}/sse`, {
    headers,
    signal: controller.signal,
  });
  expect(res.status).toBe(200);
  const next = eventReader(res.body as ReadableStream<Uint8Array>);
  const endpoint = new URL(await next('endpoint'), baseUrl);
  const post = (body: object, postHeaders: Record<string, string> = {}) =>
    fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...postHeaders },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, ...body }),
    });
  const probe = async (
    id: string,
    delayMs = 0,
    postHeaders: Record<string, string> = {},
  ): Promise<{ text: string; isError: boolean }> => {
    const accepted = await post(
      {
        method: 'tools/call',
        params: { name: 'ProbeAdt', arguments: { id, delayMs } },
      },
      postHeaders,
    );
    expect(accepted.status).toBe(202);
    const message = JSON.parse(await next('message')) as {
      result: { content: { text: string }[]; isError?: boolean };
    };
    return {
      text: message.result.content[0].text,
      isError: !!message.result.isError,
    };
  };
  return { post, probe };
}

describe("a connection's credential is its opening GET's", () => {
  it('opened with x-sap-* basic: its POSTs reach the stand-in as that user', async () => {
    const session = await connect(basic('USER_A', 'pass-a'));
    expect(await session.probe('b1')).toEqual({ text: 'b1', isError: false });
    expect(await session.probe('b2')).toEqual({ text: 'b2', isError: false });
    expect(standIn.authorizationOf('b1')).toBe(basicOf('USER_A', 'pass-a'));
    expect(standIn.authorizationOf('b2')).toBe(basicOf('USER_A', 'pass-a'));
  });

  it('opened with a token: its POSTs reach the stand-in with that Bearer token', async () => {
    const session = await connect(token('token-a.payload.sig'));
    expect(await session.probe('t1')).toEqual({ text: 't1', isError: false });
    expect(standIn.authorizationOf('t1')).toBe('Bearer token-a.payload.sig');
  });

  it("a POST's own x-sap-* headers change nothing", async () => {
    const session = await connect(basic('USER_A', 'pass-a'));
    expect(
      await session.probe('p1', 0, {
        ...basic('USER_B', 'pass-b'),
        ...token('token-b.payload.sig'),
      }),
    ).toEqual({ text: 'p1', isError: false });
    expect(standIn.authorizationOf('p1')).toBe(basicOf('USER_A', 'pass-a'));
  });
});

describe('a request the server does not serve', () => {
  it('no SAP_SYSTEM_TYPE: a call is refused system_type_required, nothing sent', async () => {
    delete process.env.SAP_SYSTEM_TYPE;
    const session = await connect(basic('USER_A', 'pass-a'));
    const answer = await session.probe('k1');
    expect(answer.isError).toBe(true);
    expect(JSON.parse(answer.text)).toMatchObject({
      error: 'system_type_required',
      message: SYSTEM_TYPE_REQUIRED_WORDS,
    });
    expect(standIn.requests).toEqual([]);
  });

  it('a GET without credentials: 400 with its sentence', async () => {
    const res = await fetch(`${baseUrl}/sse`);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(CREDENTIALS_REQUIRED_WORDS);
    expect(standIn.requests).toEqual([]);
  });

  it('a GET with x-mcp-destination: 400 with its sentence', async () => {
    const res = await fetch(`${baseUrl}/sse`, {
      headers: { ...basic('USER_A', 'pass-a'), 'x-mcp-destination': 'TRIAL' },
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(DESTINATIONS_ONLY_STDIO_WORDS);
  });

  it('a POST with x-mcp-destination: 400 with its sentence, the tool not reached', async () => {
    const session = await connect(basic('USER_A', 'pass-a'));
    const res = await session.post(
      {
        method: 'tools/call',
        params: { name: 'ProbeAdt', arguments: { id: 'd1' } },
      },
      { 'x-mcp-destination': 'TRIAL' },
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(DESTINATIONS_ONLY_STDIO_WORDS);
    expect(standIn.authorizationOf('d1')).toBeUndefined();
  });
});

describe('nothing is shared across connections', () => {
  it('two concurrent connections with different users never see each other’s credential', async () => {
    const [a, b] = await Promise.all([
      connect(basic('USER_A', 'pass-a')),
      connect(basic('USER_B', 'pass-b')),
    ]);
    const [ra, rb] = await Promise.all([a.probe('ca', 80), b.probe('cb', 0)]);
    expect(ra.isError || rb.isError).toBe(false);
    expect(standIn.authorizationOf('ca')).toBe(basicOf('USER_A', 'pass-a'));
    expect(standIn.authorizationOf('cb')).toBe(basicOf('USER_B', 'pass-b'));
  });
});
