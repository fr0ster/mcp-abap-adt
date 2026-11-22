/**
 * abapGit is offered only where the system serves it (spec §4.5): a
 * `tools/list` lists the abapGit tools only when the discovery of the
 * system the request reaches lists `/sap/bc/adt/abapgit/repos`, and a call
 * of one is refused "abapGit is not served by this system" otherwise. The
 * answer is kept by system key for the process; a failed read is not kept;
 * the connection-reset hook drops it. stdio's `--deferred-logon` lists no
 * abapGit tool and logs on to no one before its first birth, then tells the
 * client once (§9.1 a).
 *
 * Against the ADT stand-in, through real servers: stdio over an in-memory
 * transport, SSE over a real stream, Streamable HTTP over real HTTP — each
 * serving a probe tool and a stand-in abapGit tool (`ListAbapGitRepos`)
 * whose handler sends one probe request.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
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

describe('stdio: abapGit listed and served by the system’s discovery', () => {
  it('lists the abapGit tool when the discovery lists /abapgit/repos', async () => {
    const standIn = await adtStandIn();
    standIn.body(isDiscovery, SERVED_DISCOVERY);
    const s = await stdio(standIn);
    try {
      assert.deepEqual(await listedNames(s.client), ['ProbeAdt', ABAPGIT_TOOL]);
      assert.equal(discoveryReads(standIn), 1);
    } finally {
      await s.close();
      await standIn.close();
    }
  });

  it('leaves it out when the discovery does not list it, and refuses its call with nothing sent', async () => {
    const standIn = await adtStandIn();
    standIn.body(isDiscovery, UNSERVED_DISCOVERY);
    const s = await stdio(standIn);
    try {
      assert.deepEqual(await listedNames(s.client), ['ProbeAdt']);
      const answer = await called(s.client, ABAPGIT_TOOL);
      assert.equal(answer.isError, true);
      assert.match(answer.text, /abapgit_not_served/);
      assert.match(answer.text, /abapGit is not served by this system/);
      assert.equal(standIn.requests.filter(isProbe).length, 0);
    } finally {
      await s.close();
      await standIn.close();
    }
  });

  it('a failed discovery lists none, keeps nothing, and is read again next time', async () => {
    const standIn = await adtStandIn();
    standIn.answer(isDiscoveryRead, 500);
    const s = await stdio(standIn);
    try {
      assert.deepEqual(await listedNames(s.client), ['ProbeAdt']);
      assert.equal(discoveryReads(standIn), 1);
      standIn.respond(isDiscoveryRead, () => ({
        status: 200,
        text: SERVED_DISCOVERY,
      }));
      assert.deepEqual(await listedNames(s.client), ['ProbeAdt', ABAPGIT_TOOL]);
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
      await listedNames(first.client);
      await listedNames(second.client);
      await listedNames(first.client);
      assert.equal(discoveryReads(standIn), 1);
      notifyConnectionResetListeners();
      await listedNames(second.client);
      assert.equal(discoveryReads(standIn), 2);
    } finally {
      await first.close();
      await second.close();
      await standIn.close();
    }
  });

  it('a real tools/list releases its connection use, on success and on a failed discovery', async () => {
    const standIn = await adtStandIn();
    standIn.body(isDiscovery, SERVED_DISCOVERY);
    const s = await stdio(standIn);
    try {
      await listedNames(s.client);
      assert.equal(s.server.taken, 1);
      assert.equal(s.server.released, 1);
      notifyConnectionResetListeners();
      standIn.answer(isDiscoveryRead, 500);
      await listedNames(s.client);
      assert.equal(s.server.taken, 2);
      assert.equal(s.server.released, 2);
    } finally {
      await s.close();
      await standIn.close();
    }
  });
});

describe('stdio --deferred-logon (spec §9.1 a)', () => {
  it('the first listing logs on to no one and lists no abapGit tool; the first birth reads once and notifies once', async () => {
    const standIn = await adtStandIn();
    standIn.body(isDiscovery, SERVED_DISCOVERY);
    const s = await stdio(standIn, true);
    try {
      assert.deepEqual(await listedNames(s.client), ['ProbeAdt']);
      assert.equal(standIn.requests.length, 0);
      assert.equal(s.server.taken, 0);
      await s.client.callTool({ name: 'ProbeAdt', arguments: { id: 'one' } });
      await until(() => s.notified() >= 1);
      assert.equal(s.notified(), 1);
      assert.equal(discoveryReads(standIn), 1);
      assert.deepEqual(await listedNames(s.client), ['ProbeAdt', ABAPGIT_TOOL]);
      await s.client.callTool({ name: 'ProbeAdt', arguments: { id: 'two' } });
      await listedNames(s.client);
      assert.equal(s.notified(), 1);
      assert.equal(discoveryReads(standIn), 1);
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

async function listedOver(
  transport: Parameters<Client['connect']>[0],
): Promise<string[]> {
  const client = new Client({ name: 'abapgit-availability', version: '1' });
  await client.connect(transport);
  try {
    return await listedNames(client);
  } finally {
    await client.close();
  }
}

async function sseListed(standIn: AdtStandIn): Promise<string[]> {
  const sse = new SseServer(registry(), { host: '127.0.0.1', port: 0 });
  await sse.start();
  const headers = sapHeaders(standIn.url);
  try {
    return await listedOver(
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
    );
  } finally {
    await sse.stop();
  }
}

async function httpListed(standIn: AdtStandIn): Promise<string[]> {
  const mcp = new StreamableHttpServer(registry(), {
    host: '127.0.0.1',
    port: 0,
  });
  await mcp.start();
  try {
    return await listedOver(
      clientTransport(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${boundPort(mcp)}/mcp/stream/http`),
          { requestInit: { headers: sapHeaders(standIn.url) } },
        ),
      ),
    );
  } finally {
    await mcp.stop();
  }
}

for (const [transport, listed] of [
  ['SSE', sseListed],
  ['Streamable HTTP', httpListed],
] as const) {
  describe(`${transport}: the listing reads the discovery of the system the request reaches`, () => {
    it('lists the abapGit tool where the discovery lists /abapgit/repos', async () => {
      const standIn = await adtStandIn();
      standIn.body(isDiscovery, SERVED_DISCOVERY);
      try {
        assert.deepEqual(await listed(standIn), ['ProbeAdt', ABAPGIT_TOOL]);
        assert.equal(discoveryReads(standIn), 1);
      } finally {
        await standIn.close();
      }
    });

    it('leaves it out where it does not', async () => {
      const standIn = await adtStandIn();
      standIn.body(isDiscovery, UNSERVED_DISCOVERY);
      try {
        assert.deepEqual(await listed(standIn), ['ProbeAdt']);
      } finally {
        await standIn.close();
      }
    });
  });
}
