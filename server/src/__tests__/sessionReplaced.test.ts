/**
 * A session SAP ended, on stdio (#295): the connection the start made
 * (`connectAtStart`) is the one every tool call takes. When SAP answers a
 * request with another session's cookie — the old session idled out — the
 * real connection's own identity check answers that call
 * `SESSION_REPLACED`, nothing retried; the connection is spent from then on,
 * so the next call logs on again and runs on the new session, and the
 * replaced connection is ended.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { AdtOnPremConnector, type SapConfig } from '@mcp-abap-adt/connection';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  type AdtStandIn,
  adtStandIn,
  PROBE_PATH,
  probeGroup,
} from '../../../src/__tests__/helpers/adtStandIn';
import type { IDestinations } from '../auth/IAuthBrokerFactory.js';
import { StdioServer } from '../StdioServer.js';

jest.setTimeout(30_000);

let standIn: AdtStandIn;

beforeEach(async () => {
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  standIn = await adtStandIn();
});

afterEach(async () => {
  await standIn.close();
  jest.restoreAllMocks();
});

async function serveAtStart() {
  const settings: SapConfig = {
    url: standIn.url,
    client: '100',
    authType: 'basic',
    username: 'CORE_USER',
  };
  const credential = new BasicAuthProvider('CORE_USER', 'core-password');
  const destinations = {
    settingsFor: async () => settings,
    getProvider: async () => credential,
  } as unknown as IDestinations;
  const server = new StdioServer(
    new CompositeHandlersRegistry([probeGroup()]),
    destinations,
  );
  // The launcher's order: the connection born, then the transport opened.
  await server.connectAtStart('dest');
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'session-replaced', version: '1.0.0' });
  await Promise.all([
    server.start('dest', serverSide),
    client.connect(clientSide),
  ]);
  const call = async (id: string) => {
    const answer = (await client.callTool({
      name: 'ProbeAdt',
      arguments: { id },
    })) as { isError?: boolean; content: Array<{ text: string }> };
    return { text: answer.content[0]?.text ?? '', isError: !!answer.isError };
  };
  return { server, client, call };
}

/** The session the probe request `id` ran in, at the stand-in. */
const sessionOfProbe = (id: string) =>
  standIn.requests.find((r) => r.url === `${PROBE_PATH}${id}`)?.session;

it('stdio: a call that meets a session SAP replaced answers SESSION_REPLACED; the next call logs on again, runs on the new session, and the replaced connection is ended', async () => {
  // Every disconnect() of the real connector, with the instance it ended.
  const disconnect = jest.spyOn(AdtOnPremConnector.prototype, 'disconnect');
  const { server, client, call } = await serveAtStart();
  let closed = false;
  try {
    const logons = () =>
      standIn.requests.filter((r) => r.url === '/sap/bc/adt/core/discovery')
        .length;
    // The start logged on once.
    expect(logons()).toBe(1);
    expect(await call('one')).toEqual({ text: 'one', isError: false });
    const first = sessionOfProbe('one');
    expect(first).toBeDefined();

    // SAP ended the start's session: the next request on it lands in another.
    standIn.endSession(first as string);
    const replaced = await call('two');
    expect(replaced.isError).toBe(true);
    // The connection's own SESSION_REPLACED, as it is: nothing retried.
    expect(replaced.text).toContain(
      'The SAP session this connection was using is gone and the requests are now on a different one',
    );
    expect(
      standIn.requests.filter((r) => r.url === `${PROBE_PATH}two`),
    ).toHaveLength(1);
    expect(logons()).toBe(1);

    // The next call logs on again and runs on the new session.
    expect(await call('three')).toEqual({ text: 'three', isError: false });
    expect(logons()).toBe(2);
    const third = sessionOfProbe('three');
    expect(third).toBeDefined();
    expect(third).not.toBe(first);
    expect(third).not.toBe(sessionOfProbe('two'));

    // The replaced connection is ended — once, and not the one in use.
    expect(disconnect).toHaveBeenCalledTimes(1);
    const retired = disconnect.mock.contexts[0] as AdtOnPremConnector;
    expect(retired.isConnected()).toBe(false);

    await client.close();
    await server.terminalClose();
    closed = true;
    // The replacement ends at the instance's close, with its logoff. (The
    // replaced one's disconnect() writes none: connection 18 dropped the
    // session's cookies when it raised the loss.)
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(disconnect.mock.contexts[1]).not.toBe(retired);
    expect(standIn.loggedOff()).toContain(third);
  } finally {
    if (!closed) {
      await client.close();
      await server.terminalClose();
    }
  }
});
