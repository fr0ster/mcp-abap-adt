/**
 * abapGit availability is decided at call time only (spec §4.5, owner
 * 2026-11-23): `tools/list` lists the abapGit tools without any SAP request
 * (no logon, no discovery), and a call of one on a system whose discovery
 * does not list `/sap/bc/adt/abapgit/repos` is refused "abapGit is not
 * served by this system", nothing else sent. The answer is kept by system
 * key for the process; a failed read is not kept; the connection-reset hook
 * drops it. stdio's `--deferred-logon` lists them before any logon, and its
 * first birth sends no `tools/list_changed`.
 *
 * Against the ADT stand-in, through real servers: stdio over an in-memory
 * transport, SSE over a real stream, Streamable HTTP over real HTTP — each
 * serving a probe tool and a stand-in abapGit tool (`ListAbapGitRepos`)
 * whose handler sends one probe request.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod';
import { StreamableHttpServer } from '../../../../server-runtime/src/http/StreamableHttpServer';
import { SseServer } from '../../../../server-runtime/src/sse/SseServer';
import type { IDestinations } from '../../../../server-runtime/src/stdio/auth/IAuthBrokerFactory';
import { StdioServer } from '../../../../server-runtime/src/stdio/StdioServer';
import { abapGitServed } from '../../../lib/abapGit/availability';
import { notifyConnectionResetListeners } from '../../../lib/connectionEvents';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  type AdtStandIn,
  adtStandIn,
  PROBE_PATH,
  probeGroup,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { clientTransport } from '../../helpers/clientTransport';

const ABAPGIT_TOOL = 'ListAbapGitRepos';

const SERVED_DISCOVERY =
  '<?xml version="1.0" encoding="utf-8"?><app:service xmlns:app="http://www.w3.org/2007/app"><app:workspace>' +
  '<app:collection href="/sap/bc/adt/abapgit/repos"/>' +
  '<app:collection href="/sap/bc/adt/abapgit/externalrepoinfo"/>' +
  '</app:workspace></app:service>';

const UNSERVED_DISCOVERY =
  '<?xml version="1.0" encoding="utf-8"?><app:service xmlns:app="http://www.w3.org/2007/app"><app:workspace>' +
  '<app:collection href="/sap/bc/adt/activation"/>' +
  '</app:workspace></app:service>';

/** The discovery read the availability check sends (adt-clients' `getDiscovery`: a request id). */
const isDiscoveryRead = (request: StandInRequest): boolean =>
  request.method === 'GET' &&
  request.url.split('?')[0] === '/sap/bc/adt/discovery' &&
  request.headers['sap-adt-request-id'] !== undefined;

const isDiscovery = (request: StandInRequest): boolean =>
  request.url.split('?')[0] === '/sap/bc/adt/discovery';

const discoveryReads = (standIn: AdtStandIn): number =>
  standIn.requests.filter(isDiscoveryRead).length;

const isProbe = (request: StandInRequest): boolean =>
  request.url.startsWith(PROBE_PATH);

/** What the call's connection sends to set itself up (its logon, its CSRF token), not the call's own. */
const isConnectionSetup = (url: string): boolean =>
  url.split('?')[0] === '/sap/bc/adt/core/discovery' ||
  url.startsWith('/sap/bc/adt/core/http/systeminformation') ||
  url.startsWith('/sap/bc/adt/core/http/sessions');

/** The stand-in abapGit tool: one probe request on its connection. */
const abapGitEntry: HandlerEntry = {
  toolDefinition: {
    name: ABAPGIT_TOOL,
    description: 'lists the repositories',
    inputSchema: z.object({ state_handle: z.string().optional() }),
  },
  call: async (context) => {
    await context.connection.makeAdtRequest({
      url: `${PROBE_PATH}abapgit`,
      method: 'GET',
      timeout: 0,
    });
    return { content: [{ type: 'text', text: 'abapgit' }] };
  },
};

const registry = () =>
  new CompositeHandlersRegistry([probeGroup([abapGitEntry])]);

const PROVIDER = new BasicAuthProvider('GIT_USER', 'git-password');

function destinationsOf(standIn: AdtStandIn): IDestinations {
  return {
    settingsFor: async () => ({
      url: standIn.url,
      client: '100',
      authType: 'basic',
      username: 'GIT_USER',
    }),
    getProvider: async () => PROVIDER,
  };
}

/** stdio's server whose uses of its connection are counted. */
class CountingStdioServer extends StdioServer {
  taken = 0;
  released = 0;
  protected override async getConnection(
    signal: AbortSignal,
  ): Promise<IAbapConnection> {
    const connection = await super.getConnection(signal);
    this.taken += 1;
    return connection;
  }
  protected override connectionReleased(connection: IAbapConnection): void {
    this.released += 1;
    super.connectionReleased(connection);
  }
}

async function stdio(standIn: AdtStandIn, deferredLogon = false) {
  const server = new CountingStdioServer(registry(), destinationsOf(standIn), {
    deferredLogon,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'abapgit-availability', version: '1' });
  let notified = 0;
  client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
    notified += 1;
  });
  await Promise.all([
    server.start('dest', serverSide),
    client.connect(clientSide),
  ]);
  return {
    server,
    client,
    notified: () => notified,
    close: async () => {
      await client.close().catch(() => undefined);
      await server.terminalClose().catch(() => undefined);
    },
  };
}

const listedNames = async (client: Client): Promise<string[]> =>
  (await client.listTools()).tools.map((tool) => tool.name);

/** The answer's text and whether it is an error. */
async function called(client: Client, name: string) {
  const result = await client.callTool({ name, arguments: {} });
  const content = Array.isArray(result.content) ? result.content : [];
  const first: unknown = content[0];
  const text =
    typeof first === 'object' &&
    first !== null &&
    'text' in first &&
    typeof first.text === 'string'
      ? first.text
      : '';
  return { isError: result.isError === true, text };
}

async function until(done: () => boolean, limitMs = 10_000): Promise<void> {
  const end = Date.now() + limitMs;
  while (!done()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

let previousType: string | undefined;
beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  notifyConnectionResetListeners();
});
afterEach(() => {
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
  notifyConnectionResetListeners();
});

describe('stdio: abapGit always listed, served by the system’s discovery at call time', () => {
  it('lists the abapGit tool without any SAP request and without taking the connection', async () => {
    const standIn = await adtStandIn();
    standIn.body(isDiscovery, UNSERVED_DISCOVERY);
    const s = await stdio(standIn);
    try {
      const before = standIn.requests.length;
      assert.deepEqual(await listedNames(s.client), ['ProbeAdt', ABAPGIT_TOOL]);
      assert.equal(standIn.requests.length, before);
      assert.equal(s.server.taken, 0);
    } finally {
      await s.close();
      await standIn.close();
    }
  });

  it('serves the call where the discovery lists /abapgit/repos', async () => {
    const standIn = await adtStandIn();
    standIn.body(isDiscovery, SERVED_DISCOVERY);
    const s = await stdio(standIn);
    try {
      const answer = await called(s.client, ABAPGIT_TOOL);
      assert.equal(answer.isError, false);
      assert.equal(answer.text, 'abapgit');
      assert.equal(discoveryReads(standIn), 1);
      assert.equal(standIn.requests.filter(isProbe).length, 1);
    } finally {
      await s.close();
      await standIn.close();
    }
  });

  it('an unserved system answers abapgit_not_served: the cold call sends the logon, the systeminformation read and the discovery, and no abapGit request or credential', async () => {
    const standIn = await adtStandIn();
    standIn.body(isDiscovery, UNSERVED_DISCOVERY);
    const s = await stdio(standIn);
    try {
      await listedNames(s.client);
      const before = standIn.requests.length;
      const answer = await called(s.client, ABAPGIT_TOOL);
      assert.equal(answer.isError, true);
      assert.match(answer.text, /abapgit_not_served/);
      assert.match(answer.text, /abapGit is not served by this system/);
      const sent = standIn.requests.slice(before);
      // Taking the connection logs on (its CSRF fetch) and reads
      // systeminformation; the availability check reads the discovery.
      // Nothing else is sent.
      assert.deepEqual(
        sent.map((request) => `${request.method} ${request.url.split('?')[0]}`),
        [
          'GET /sap/bc/adt/core/discovery',
          'GET /sap/bc/adt/core/http/systeminformation',
          'GET /sap/bc/adt/discovery',
        ],
      );
      for (const request of sent) {
        assert.deepEqual(
          Object.keys(request.headers).filter((name) =>
            name.startsWith('x-abapgit-'),
          ),
          [],
        );
      }
    } finally {
      await s.close();
      await standIn.close();
    }
  });

  it('a failed discovery refuses the call, keeps nothing, and is read again next time', async () => {
    const standIn = await adtStandIn();
    standIn.answer(isDiscoveryRead, 500);
    const s = await stdio(standIn);
    try {
      const refused = await called(s.client, ABAPGIT_TOOL);
      assert.match(refused.text, /abapgit_not_served/);
      assert.equal(discoveryReads(standIn), 1);
      standIn.respond(isDiscoveryRead, () => ({
        status: 200,
        text: SERVED_DISCOVERY,
      }));
      const served = await called(s.client, ABAPGIT_TOOL);
      assert.equal(served.text, 'abapgit');
      assert.equal(discoveryReads(standIn), 2);
    } finally {
      await s.close();
      await standIn.close();
    }
  });

  it('one read per system key across two instances (two state handles), until the reset hook drops it', async () => {
    const standIn = await adtStandIn();
    standIn.body(isDiscovery, SERVED_DISCOVERY);
    const first = await stdio(standIn);
    const second = await stdio(standIn);
    try {
      assert.notEqual(first.server.stateHandle, second.server.stateHandle);
      await called(first.client, ABAPGIT_TOOL);
      await called(second.client, ABAPGIT_TOOL);
      await called(first.client, ABAPGIT_TOOL);
      assert.equal(discoveryReads(standIn), 1);
      notifyConnectionResetListeners();
      await called(second.client, ABAPGIT_TOOL);
      assert.equal(discoveryReads(standIn), 2);
    } finally {
      await first.close();
      await second.close();
      await standIn.close();
    }
  });
});

describe('stdio --deferred-logon', () => {
  it('the first listing lists the abapGit tool and logs on to no one; the first birth sends no tools/list_changed', async () => {
    const standIn = await adtStandIn();
    standIn.body(isDiscovery, SERVED_DISCOVERY);
    const s = await stdio(standIn, true);
    try {
      assert.deepEqual(await listedNames(s.client), ['ProbeAdt', ABAPGIT_TOOL]);
      assert.equal(standIn.requests.length, 0);
      assert.equal(s.server.taken, 0);
      await s.client.callTool({ name: 'ProbeAdt', arguments: { id: 'one' } });
      // The abapGit call reads the discovery; a notification sent at the
      // birth would have reached the client before this call's answer.
      await called(s.client, ABAPGIT_TOOL);
      await listedNames(s.client);
      assert.equal(discoveryReads(standIn), 1);
      assert.equal(s.notified(), 0);
    } finally {
      await s.close();
      await standIn.close();
    }
  });
});

const sapHeaders = (url: string): Record<string, string> => ({
  'x-sap-url': url,
  'x-sap-client': '100',
  'x-sap-login': 'GIT_USER',
  'x-sap-password': 'git-password',
});

function boundPort(server: { listeningPort(): number | undefined }): number {
  const port = server.listeningPort();
  if (port === undefined) throw new Error('the server listens on no port');
  return port;
}

/** What one client session over a transport saw: the listing, the requests it sent, a call's answer. */
interface Session {
  readonly listed: string[];
  readonly sentByListing: number;
  readonly answer: { isError: boolean; text: string };
}

async function sessionOver(
  transport: Parameters<Client['connect']>[0],
  standIn: AdtStandIn,
): Promise<Session> {
  const client = new Client({ name: 'abapgit-availability', version: '1' });
  await client.connect(transport);
  try {
    const before = standIn.requests.length;
    const listed = await listedNames(client);
    const sentByListing = standIn.requests.length - before;
    const answer = await called(client, ABAPGIT_TOOL);
    return { listed, sentByListing, answer };
  } finally {
    await client.close();
  }
}

async function sseSession(standIn: AdtStandIn): Promise<Session> {
  const sse = new SseServer(registry(), { host: '127.0.0.1', port: 0 });
  await sse.start();
  const headers = sapHeaders(standIn.url);
  try {
    return await sessionOver(
      new SSEClientTransport(
        new URL(`http://127.0.0.1:${boundPort(sse)}/sse`),
        {
          requestInit: { headers },
          eventSourceInit: {
            fetch: (url, init) =>
              fetch(url, {
                ...init,
                headers: { ...(init?.headers ?? {}), ...headers },
              }),
          },
        },
      ),
      standIn,
    );
  } finally {
    await sse.stop();
  }
}

async function httpSession(standIn: AdtStandIn): Promise<Session> {
  const mcp = new StreamableHttpServer(registry(), {
    host: '127.0.0.1',
    port: 0,
  });
  await mcp.start();
  try {
    return await sessionOver(
      clientTransport(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${boundPort(mcp)}/mcp/stream/http`),
          { requestInit: { headers: sapHeaders(standIn.url) } },
        ),
      ),
      standIn,
    );
  } finally {
    await mcp.stop();
  }
}

for (const [transport, session] of [
  ['SSE', sseSession],
  ['Streamable HTTP', httpSession],
] as const) {
  describe(`${transport}: listed without a request, served by the discovery of the system the call reaches`, () => {
    it('lists the abapGit tool without any SAP request, and serves the call where the discovery lists /abapgit/repos', async () => {
      const standIn = await adtStandIn();
      standIn.body(isDiscovery, SERVED_DISCOVERY);
      try {
        const seen = await session(standIn);
        assert.deepEqual(seen.listed, ['ProbeAdt', ABAPGIT_TOOL]);
        assert.equal(seen.sentByListing, 0);
        assert.equal(seen.answer.text, 'abapgit');
        assert.equal(discoveryReads(standIn), 1);
      } finally {
        await standIn.close();
      }
    });

    it('lists it where the discovery does not, and refuses the call abapgit_not_served with nothing sent', async () => {
      const standIn = await adtStandIn();
      standIn.body(isDiscovery, UNSERVED_DISCOVERY);
      try {
        const seen = await session(standIn);
        assert.deepEqual(seen.listed, ['ProbeAdt', ABAPGIT_TOOL]);
        assert.equal(seen.sentByListing, 0);
        assert.equal(seen.answer.isError, true);
        assert.match(seen.answer.text, /abapgit_not_served/);
        assert.equal(standIn.requests.filter(isProbe).length, 0);
      } finally {
        await standIn.close();
      }
    });
  });
}

/** A connection whose discovery reads wait until `release()`, counted. */
function heldDiscovery() {
  let reads = 0;
  const waiting: Array<() => void> = [];
  const connection: IAbapConnection = {
    async connect() {},
    async getBaseUrl() {
      return 'https://sap.example.invalid';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest<T = unknown, D = unknown>(
      _options: IAbapRequestOptions,
    ): Promise<IAdtWireResponse<T, D>> {
      reads += 1;
      await new Promise<void>((resolve) => waiting.push(resolve));
      // A recorded body is text; `T` is the caller's view of it.
      return {
        data: SERVED_DISCOVERY as T,
        status: 200,
        statusText: 'OK',
        headers: {},
      };
    },
  };
  return {
    connection,
    reads: () => reads,
    release: () => {
      for (const resolve of waiting.splice(0)) resolve();
    },
  };
}

describe('one discovery read in flight per system key', () => {
  const SYSTEM = JSON.stringify(['http', 'https://sap.example.invalid', '100']);

  it('two concurrent cold lookups share one request', async () => {
    const sap = heldDiscovery();
    const first = abapGitServed(sap.connection, SYSTEM);
    const second = abapGitServed(sap.connection, SYSTEM);
    await until(() => sap.reads() >= 1);
    sap.release();
    assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(sap.reads(), 1);
  });

  it('a reset while a read is in flight: that read fills nothing, the next lookup reads again', async () => {
    const sap = heldDiscovery();
    const before = abapGitServed(sap.connection, SYSTEM);
    await until(() => sap.reads() === 1);
    notifyConnectionResetListeners();
    sap.release();
    assert.equal(await before, true);
    const after = abapGitServed(sap.connection, SYSTEM);
    await until(() => sap.reads() === 2);
    sap.release();
    assert.equal(await after, true);
    assert.equal(sap.reads(), 2);
  });
});
