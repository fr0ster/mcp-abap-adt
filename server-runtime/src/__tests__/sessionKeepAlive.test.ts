/**
 * The session keep-alive under the MCP transports (24.0.1): the instance
 * that holds a connection to SAP pings it once idle, whatever the MCP
 * client's transport — stdio's one instance, an SSE stream's instance.
 * Against the ADT stand-in, on the real clock with an interval of a few
 * milliseconds (the fake-clock cases are `src/__tests__/unit/keepAlive/`).
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  type AdtStandIn,
  adtStandIn,
  probeGroup,
} from '../../../src/__tests__/helpers/adtStandIn';
import { SESSION_KEEP_ALIVE_URL } from '../../../src/lib/sessionKeepAlive';
import { sseStand } from '../sse/__tests__/shutdown/harness';
import type { IDestinations } from '../stdio/auth/IAuthBrokerFactory.js';
import { StdioServer } from '../stdio/StdioServer.js';

const INTERVAL_MS = 20;

const pings = (standIn: AdtStandIn) =>
  standIn.requests.filter(
    (r) => r.method === 'GET' && r.url === SESSION_KEEP_ALIVE_URL,
  );

async function until(done: () => boolean, limitMs = 10_000): Promise<void> {
  const end = Date.now() + limitMs;
  while (!done()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe('the session keep-alive under the MCP transports', () => {
  it('stdio: the connection to SAP the start made is pinged once idle', async () => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const standIn = await adtStandIn();
    cleanups.push(() => standIn.close());
    const settings: SapConfig = {
      url: standIn.url,
      client: '100',
      authType: 'basic',
      username: 'KA_USER',
    };
    const credential = new BasicAuthProvider('KA_USER', 'ka-password');
    const destinations = {
      settingsFor: async () => settings,
      getProvider: async () => credential,
    } as unknown as IDestinations;
    const server = new StdioServer(
      new CompositeHandlersRegistry([probeGroup()]),
      destinations,
      { sessionKeepAliveMs: INTERVAL_MS },
    );
    cleanups.push(() => server.terminalClose());
    await server.connectAtStart('dest');
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'keep-alive', version: '1.0.0' });
    await Promise.all([
      server.start('dest', serverSide),
      client.connect(clientSide),
    ]);
    cleanups.push(() => client.close());
    await client.callTool({ name: 'ProbeAdt', arguments: { id: 'a' } });
    await until(() => pings(standIn).length >= 1);
    const probe = standIn.requests.find((r) => r.url.endsWith('/probe/a'));
    assert.equal(pings(standIn)[0]?.session, probe?.session);
  });

  it('SSE: a stream’s connection to SAP is pinged once idle', async () => {
    const s = await sseStand({ server: { sessionKeepAliveMs: INTERVAL_MS } });
    cleanups.push(() => s.close());
    const connection = await s.open();
    await connection.call('ProbeAdt', { id: 'a' }, 1);
    assert.equal((await connection.answer(1)).isError, false);
    await until(() => pings(s.standIn).length >= 1);
    const probe = s.standIn.requests.find((r) => r.url.endsWith('/probe/a'));
    assert.equal(pings(s.standIn)[0]?.session, probe?.session);
  });
});
