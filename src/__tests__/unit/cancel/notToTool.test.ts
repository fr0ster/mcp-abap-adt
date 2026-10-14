/**
 * A tool call cannot be cancelled; it ends with its result or with the
 * session. In core (stdio), SSE and an embedded server a client's MCP cancel
 * aborts nothing: the call runs to its end and reaches its tool. Over
 * Streamable HTTP, whose requests are each their own, the client closing its
 * request ends no call either: a dropped request closes nothing, and the
 * admitted call reaches its tool.
 *
 * Each server runs a probe tool against an ADT stand-in on an ABAP Cloud
 * system type, so before the tool runs the call asks the system for its
 * responsible person (`systeminformation`) on the connection it acquired. The
 * stand-in holds that request; the client cancels the call while it is held
 * — after the connection is ready — and the stand-in then answers. A
 * control call, held and released the same way without a cancel, reaches
 * its tool. Each case runs on a server of its own, since the lookup is made
 * once per connection.
 */

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import express from 'express';
import { StreamableHttpServer } from '../../../../http/src/StreamableHttpServer';
import { StdioServer } from '../../../../server/src/StdioServer';
import { SseServer } from '../../../../sse/src/SseServer';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import type { IHttpApplication } from '../../../embeddable/IHttpApplication';
import { activeTools } from '../../../lib/activeTools';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  type AdtStandIn,
  adtStandIn,
  PROBE_PATH,
  probeGroup,
} from '../../helpers/adtStandIn';

const registry = () => new CompositeHandlersRegistry([probeGroup()]);

const isLookup = (request: { url: string }) =>
  request.url.includes('systeminformation');

/** Turns of the event loop until `done()` holds; fails after `limit`. */
async function until(done: () => boolean, limit = 2_000): Promise<void> {
  for (let turn = 0; turn < limit; turn += 1) {
    if (done()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('the condition never held');
}

/** What a server under test offers the scenario. */
interface Served {
  /**
   * Calls the probe; `cancel()` cancels it the transport's way: an MCP
   * cancel, or (Streamable HTTP) the request closed.
   */
  call(id: string): { cancel(): void; done: Promise<unknown> };
  close(): Promise<void>;
}

let standIn: AdtStandIn;
let previousType: string | undefined;
let stderr: string[];

beforeEach(async () => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  standIn = await adtStandIn();
  stderr = [];
  jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  jest.restoreAllMocks();
  await standIn.close();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

const settings = () => ({
  url: standIn.url,
  client: '100',
  authType: 'basic' as const,
});

/** An MCP client's call, cancelled by its own signal. */
function clientCall(client: Client, id: string) {
  const controller = new AbortController();
  const done = client
    .callTool({ name: 'ProbeAdt', arguments: { id } }, undefined, {
      signal: controller.signal,
    })
    .catch((error: unknown) => error);
  return { cancel: () => controller.abort(), done };
}

async function inMemory(
  server: { connect(t: InMemoryTransport): Promise<void> },
  start?: (t: InMemoryTransport) => Promise<void>,
): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'not-to-tool', version: '1.0.0' });
  await Promise.all([
    start ? start(serverSide) : server.connect(serverSide),
    client.connect(clientSide),
  ]);
  return client;
}

async function listen(app: express.Express): Promise<Server> {
  return new Promise<Server>((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}

const basicHeaders = () => ({
  'x-sap-url': standIn.url,
  'x-sap-client': '100',
  'x-sap-login': 'CANCEL_USER',
  'x-sap-password': 'cancel-password',
});

const SERVERS: Record<string, () => Promise<Served>> = {
  core: async () => {
    const server = new StdioServer(registry(), {
      settingsFor: async () => settings(),
      getProvider: async () =>
        new BasicAuthProvider('CANCEL_USER', 'cancel-password'),
    });
    const client = await inMemory(server, (t) => server.start('dest', t));
    return {
      call: (id) => clientCall(client, id),
      close: () => client.close(),
    };
  },

  http: async () => {
    const mcp = new StreamableHttpServer(registry(), {});
    const app = express();
    app.use(express.json());
    mcp.registerRoutes(app as unknown as IHttpApplication);
    const http = await listen(app);
    const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp/stream/http`;
    return {
      call: (id) => {
        const controller = new AbortController();
        const done = fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            ...basicHeaders(),
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'ProbeAdt', arguments: { id } },
          }),
          signal: controller.signal,
        })
          .then((response) => response.text())
          .catch((error: unknown) => error);
        return { cancel: () => controller.abort(), done };
      },
      close: async () => {
        await mcp.stop().catch(() => undefined);
        await closeServer(http);
      },
    };
  },

  sse: async () => {
    const sse = new SseServer(registry(), {});
    const app = express();
    app.use(express.json());
    sse.registerRoutes(app as unknown as IHttpApplication);
    const http = await listen(app);
    const client = new Client({ name: 'not-to-tool', version: '1.0.0' });
    await client.connect(
      new SSEClientTransport(
        new URL(`http://127.0.0.1:${(http.address() as AddressInfo).port}/sse`),
        { requestInit: { headers: basicHeaders() } },
      ),
    );
    return {
      call: (id) => clientCall(client, id),
      close: async () => {
        await client.close();
        await sse.stop().catch(() => undefined);
        await closeServer(http);
      },
    };
  },

  embedded: async () => {
    const connection = createAbapConnection(
      settings(),
      new BasicAuthProvider('CANCEL_USER', 'cancel-password'),
    );
    // A consumer's connection comes connected.
    await connection.connect();
    const server = new EmbeddableMcpServer({
      connection,
      handlersRegistry: registry(),
      systemType: 'cloud',
    });
    const client = await inMemory(server);
    return {
      call: (id) => clientCall(client, id),
      close: () => client.close(),
    };
  },
};

describe.each(Object.keys(SERVERS))('%s', (name) => {
  jest.setTimeout(30_000);

  /** A call whose system lookup is held, then released; cancelled or not. */
  async function heldCall(served: Served, id: string, cancel: boolean) {
    const hold = standIn.hold(isLookup);
    const call = served.call(id);
    await hold.arrived;
    if (cancel) {
      call.cancel();
      // An MCP cancel, or a dropped http request, aborts nothing: the call
      // is live, its signal not aborted.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(activeTools()).toHaveLength(1);
      expect(activeTools()[0]?.signal.aborted).toBe(false);
    }
    hold.release();
    // The call has settled on the server.
    await until(() => activeTools().length === 0);
    await call.done;
  }

  // Each case on a server of its own: the lookup is made once per connection.
  it('(control) a call held at the lookup and released reaches its tool', async () => {
    const served = await SERVERS[name]();
    try {
      await heldCall(served, 'reached-control', false);
      expect(standIn.requests.map((r) => r.url)).toContain(
        `${PROBE_PATH}reached-control`,
      );
    } finally {
      await served.close();
    }
  });

  it('a call cancelled after its connection is ready: an MCP cancel, or a dropped http request, aborts nothing and the tool runs once', async () => {
    const served = await SERVERS[name]();
    try {
      await heldCall(served, 'cancelled', true);
      const urls = standIn.requests.map((r) => r.url);
      expect(
        urls.filter((url) => url === `${PROBE_PATH}cancelled`),
      ).toHaveLength(1);
    } finally {
      await served.close();
    }
  });
});
