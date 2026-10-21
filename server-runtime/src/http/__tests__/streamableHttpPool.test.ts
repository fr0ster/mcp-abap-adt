/**
 * Over real HTTP, every request its own MCP session: the pool keeps the
 * instance that holds state, routes its handle back to it, leases it to one
 * transport at a time — also past a client that disconnected — and disposes
 * it when it holds nothing or the server stops. The probe tools touch only
 * the instance state; no SAP call is made.
 */

import type { AddressInfo } from 'node:net';
import { BaseMcpServer } from '@mcp-abap-adt/lib/embeddable';
import {
  CompositeHandlersRegistry,
  type HandlerEntry,
} from '@mcp-abap-adt/lib/handlers';
import type { InstanceState, StatePart } from '@mcp-abap-adt/lib/state';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { withSystemInformation } from '../../../../src/__tests__/helpers/systemInformationStandIn';
import { StreamableHttpServer } from '../StreamableHttpServer.js';

/** Every request carries its own credentials: the server takes them from nowhere else. */
const CREDENTIALS = {
  'x-sap-url': 'https://sap.invalid',
  'x-sap-client': '100',
  'x-sap-jwt-token': 'header.payload.signature',
};

/** A part the probe tools drive: held while `held`. */
class ProbePart implements StatePart {
  held = false;
  disposed = 0;
  private notify: () => void = () => {};
  holdsState() {
    return this.held;
  }
  pending() {
    return false;
  }
  failures() {
    return [];
  }
  async dispose() {
    this.disposed++;
    this.set(false);
  }
  observe(f: () => void) {
    this.notify = f;
  }
  set(v: boolean) {
    this.held = v;
    this.notify();
  }
}

const parts = new WeakMap<InstanceState, ProbePart>();
const allParts: ProbePart[] = [];
function partOf(state: InstanceState): ProbePart {
  let part = parts.get(state);
  if (!part) {
    part = new ProbePart();
    parts.set(state, part);
    allParts.push(part);
    state.attach(part);
  }
  return part;
}

function gate() {
  let open!: () => void;
  const p = new Promise<void>((r) => {
    open = r;
  });
  return { p, open };
}
let currentGate = gate();
let gateEntered = gate();

type Ctx = { state: InstanceState };
type Args = { state_handle?: string };
const text = (t: string) => ({ content: [{ type: 'text', text: t }] });
const withHandle = {
  type: 'object',
  properties: { state_handle: { type: 'string', description: 'h' } },
  required: ['state_handle'],
};
const tool = (
  name: string,
  inputSchema: object,
  handler: (ctx: Ctx, args: Args) => Promise<unknown>,
): HandlerEntry => ({
  toolDefinition: { name, description: 'probe', inputSchema } as never,
  handler: handler as never,
});

const probes = new CompositeHandlersRegistry([
  {
    getName: () => 'pool-probes',
    registerHandlers: () => {},
    getHandlers: () => [
      tool(
        'PoolProbeHold',
        { type: 'object', properties: {} },
        async (ctx, _args) => {
          partOf(ctx.state).set(true);
          return text(JSON.stringify({ state_handle: ctx.state.handle }));
        },
      ),
      tool('PoolProbeEcho', withHandle, async (ctx, args) => {
        ctx.state.check(args.state_handle);
        return text(ctx.state.handle);
      }),
      tool('PoolProbeGate', withHandle, async (ctx, args) => {
        ctx.state.check(args.state_handle);
        gateEntered.open();
        await currentGate.p;
        return text(ctx.state.handle);
      }),
      tool('PoolProbeRelease', withHandle, async (ctx, args) => {
        ctx.state.check(args.state_handle);
        partOf(ctx.state).set(false);
        return text('released');
      }),
    ],
  },
]);

const tick = () => new Promise((r) => setImmediate(r));
async function until(cond: () => boolean, label: string) {
  for (let i = 0; i < 2000 && !cond(); i++) await tick();
  if (!cond()) throw new Error(`never: ${label}`);
}

describe.each([
  ['JSON', true],
  ['SSE', false],
] as const)(
  'StreamableHttpServer pool over real HTTP (%s)',
  (_mode, enableJsonResponse) => {
    let server: StreamableHttpServer;
    let url: URL;
    let previousType: string | undefined;

    beforeEach(async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(BaseMcpServer.prototype as never, 'getConnection')
        .mockResolvedValue(withSystemInformation() as never);
      previousType = process.env.SAP_SYSTEM_TYPE;
      process.env.SAP_SYSTEM_TYPE = 'onprem'; // the stub's lookup answers 404
      currentGate = gate();
      gateEntered = gate();
      server = new StreamableHttpServer(probes, {
        host: '127.0.0.1',
        port: 0,
        enableJsonResponse,
      });
      await server.start();
      const { port } = (
        server as unknown as { standaloneServer: { address(): AddressInfo } }
      ).standaloneServer.address();
      url = new URL(`http://127.0.0.1:${port}/mcp/stream/http`);
    });

    afterEach(async () => {
      currentGate.open();
      await server.stop().catch(() => undefined);
      if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
      else process.env.SAP_SYSTEM_TYPE = previousType;
      jest.restoreAllMocks();
    });

    const poolSize = () =>
      (server as unknown as { pool: { size(): number } }).pool.size();

    /** One call, its own client and its own MCP session. */
    async function call(name: string, args: Args = {}, signal?: AbortSignal) {
      const transport = new StreamableHTTPClientTransport(url, {
        requestInit: { headers: CREDENTIALS },
        fetch: (input, init) =>
          fetch(input, { ...init, signal: signal ?? init?.signal }),
      });
      const client = new Client({ name: 'pool-test', version: '1.0.0' });
      await client.connect(transport);
      try {
        const result = (await client.callTool({ name, arguments: args })) as {
          content: Array<{ text: string }>;
          isError?: boolean;
        };
        return {
          text: result.content[0]?.text ?? '',
          isError: !!result.isError,
        };
      } finally {
        await client.close().catch(() => undefined);
      }
    }

    async function hold(): Promise<string> {
      const r = await call('PoolProbeHold');
      if (r.isError) throw new Error(r.text); // the payload, not a bare boolean
      return JSON.parse(r.text).state_handle;
    }

    it('the handle comes back to the same instance', async () => {
      const handle = await hold();
      expect(handle).toMatch(/^[0-9A-F]{32}$/);
      expect(await call('PoolProbeEcho', { state_handle: handle })).toEqual({
        text: handle,
        isError: false,
      });
      expect(poolSize()).toBe(1);
    });

    it('another handle is not available', async () => {
      await hold();
      const r = await call('PoolProbeEcho', { state_handle: 'F'.repeat(32) });
      expect(r.isError).toBe(true);
      expect(r.text).toContain('state is not available');
    });

    it('a second request for the handle waits for the lease', async () => {
      const handle = await hold();
      const gated = call('PoolProbeGate', { state_handle: handle });
      await gateEntered.p;
      let echoed = false;
      const echo = call('PoolProbeEcho', { state_handle: handle }).then((r) => {
        echoed = true;
        return r;
      });
      for (let i = 0; i < 50; i++) await tick();
      expect(echoed).toBe(false);
      currentGate.open();
      expect(await gated).toEqual({ text: handle, isError: false });
      expect(await echo).toEqual({ text: handle, isError: false });
    });

    it('released state: the old handle is not available, and the pool is empty', async () => {
      const handle = await hold();
      expect(
        (await call('PoolProbeRelease', { state_handle: handle })).isError,
      ).toBe(false);
      const r = await call('PoolProbeEcho', { state_handle: handle });
      expect(r.isError).toBe(true);
      expect(r.text).toContain('state is not available');
      expect(poolSize()).toBe(0);
    });

    it('a client that disconnects during a held request: its transport closes at once, the lease lasts until the handler settled', async () => {
      const handle = await hold();
      const closeSpy = jest.spyOn(
        StreamableHTTPServerTransport.prototype,
        'close',
      );
      const abort = new AbortController();
      const gated = call(
        'PoolProbeGate',
        { state_handle: handle },
        abort.signal,
      ).catch((e: unknown) => e);
      await gateEntered.p;
      const closesBefore = closeSpy.mock.calls.length;
      abort.abort();
      await until(
        () => closeSpy.mock.calls.length > closesBefore,
        'the server transport closed',
      );
      await gated;

      let echoed = false;
      const echo = call('PoolProbeEcho', { state_handle: handle }).then((r) => {
        echoed = true;
        return r;
      });
      for (let i = 0; i < 50; i++) await tick();
      expect(echoed).toBe(false);
      currentGate.open();
      expect(await echo).toEqual({ text: handle, isError: false });
    });

    /** A tool call over its own client, the handle in `x-mcp-state-handle`; the logons it made. */
    async function callWithHeader(
      name: string,
      handle: string,
      args: Args = {},
    ) {
      const transport = new StreamableHTTPClientTransport(url, {
        requestInit: {
          headers: { ...CREDENTIALS, 'x-mcp-state-handle': handle },
        },
      });
      const client = new Client({ name: 'pool-test', version: '1.0.0' });
      await client.connect(transport);
      try {
        const result = (await client.callTool({ name, arguments: args })) as {
          content: Array<{ text: string }>;
          isError?: boolean;
        };
        return {
          text: result.content[0]?.text ?? '',
          isError: !!result.isError,
        };
      } finally {
        await client.close().catch(() => undefined);
      }
    }
    const logons = () =>
      (
        BaseMcpServer.prototype as unknown as {
          getConnection: jest.Mock;
        }
      ).getConnection.mock.calls.length;
    const instancesMade = () =>
      jest.spyOn(
        server as unknown as { createPerRequestServer: () => unknown },
        'createPerRequestServer',
      );

    it.each([
      ['an unknown handle', async () => 'F'.repeat(32)],
      [
        'the handle of a state that ended',
        async () => {
          const handle = await hold();
          await call('PoolProbeRelease', { state_handle: handle });
          return handle;
        },
      ],
    ])(
      '%s on a tool call: not available, answered by the pool — no logon',
      async (_name, handleOf) => {
        const handle = await handleOf();
        const made = instancesMade();
        const before = logons();
        const byArgument = await call('PoolProbeEcho', {
          state_handle: handle,
        });
        expect(byArgument).toEqual({
          text: 'state is not available',
          isError: true,
        });
        const byHeader = await callWithHeader('PoolProbeEcho', handle, {
          state_handle: handle,
        });
        expect(byHeader).toEqual({
          text: 'state is not available',
          isError: true,
        });
        // No logon for either tool call: the pool answered them.
        expect(logons()).toBe(before);
        made.mockRestore();
      },
    );

    it('a JSON-RPC batch with a tool call and an unknown header handle: not available for each request, no logon', async () => {
      const before = logons();
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...CREDENTIALS,
          'x-mcp-state-handle': 'F'.repeat(32),
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify([
          {
            jsonrpc: '2.0',
            id: 7,
            method: 'tools/call',
            params: { name: 'PoolProbeHold', arguments: {} },
          },
        ]),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([
        {
          jsonrpc: '2.0',
          id: 7,
          result: {
            content: [{ type: 'text', text: 'state is not available' }],
            isError: true,
          },
        },
      ]);
      expect(logons()).toBe(before);
    });

    it('a tool call without a handle still gets an instance', async () => {
      const made = instancesMade();
      const handle = await hold();
      expect(handle).toMatch(/^[0-9A-F]{32}$/);
      expect(made).toHaveBeenCalled();
      made.mockRestore();
    });

    it('stop() disposes the instance that holds state', async () => {
      await hold();
      const part = allParts[allParts.length - 1];
      expect(part.held).toBe(true);
      await server.stop();
      expect(part.disposed).toBe(1);
      expect(part.held).toBe(false);
      expect(poolSize()).toBe(0);
    });
  },
);

describe('StreamableHttpServer pool over real HTTP: the handle is a bearer secret', () => {
  let server: StreamableHttpServer;
  let url: URL;
  let previousType: string | undefined;

  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest
      .spyOn(BaseMcpServer.prototype as never, 'getConnection')
      .mockResolvedValue(withSystemInformation() as never);
    previousType = process.env.SAP_SYSTEM_TYPE;
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    server = new StreamableHttpServer(probes, {
      host: '127.0.0.1',
      port: 0,
    });
    await server.start();
    const { port } = (
      server as unknown as { standaloneServer: { address(): AddressInfo } }
    ).standaloneServer.address();
    url = new URL(`http://127.0.0.1:${port}/mcp/stream/http`);
  });

  afterEach(async () => {
    await server.stop().catch(() => undefined);
    if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previousType;
    jest.restoreAllMocks();
  });

  const token = {
    'x-sap-url': 'https://sap.invalid',
    'x-sap-client': '100',
    'x-sap-jwt-token': 'header.payload.signature',
  };
  const basic = (password: string) => ({
    'x-sap-url': 'https://sap.invalid',
    'x-sap-client': '100',
    'x-sap-login': 'SAPUSER01',
    'x-sap-password': password,
  });

  async function call(
    headers: Record<string, string>,
    name: string,
    args: Args = {},
  ) {
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers },
    });
    const client = new Client({ name: 'pool-test', version: '1.0.0' });
    await client.connect(transport);
    try {
      const result = (await client.callTool({ name, arguments: args })) as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      return { text: result.content[0]?.text ?? '', isError: !!result.isError };
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  it('a token request creates state; its handle reaches it from any credentials', async () => {
    const held = await call(token, 'PoolProbeHold');
    if (held.isError) throw new Error(held.text);
    const handle = JSON.parse(held.text).state_handle;
    for (const headers of [token, basic('one'), basic('two')]) {
      expect(
        await call(headers, 'PoolProbeEcho', { state_handle: handle }),
      ).toEqual({
        text: handle,
        isError: false,
      });
    }
    expect(
      (server as unknown as { pool: { size(): number } }).pool.size(),
    ).toBe(1);
  });

  it('a basic request creates state; another login reaches it with the handle, and nobody without it', async () => {
    const held = await call(basic('one'), 'PoolProbeHold');
    if (held.isError) throw new Error(held.text);
    const handle = JSON.parse(held.text).state_handle;
    expect(
      (await call(basic('two'), 'PoolProbeEcho', { state_handle: handle }))
        .text,
    ).toBe(handle);
    const other = await call(token, 'PoolProbeEcho', {
      state_handle: 'F'.repeat(32),
    });
    expect(other.text).toContain('state is not available');
  });
});
