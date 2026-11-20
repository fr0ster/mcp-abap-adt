/**
 * A session SAP ended, on stdio (#295): the connection the start made
 * (`connectAtStart`) is the one every tool call takes. When SAP answers a
 * stateless request with another session's cookie — the old session idled
 * out — the real connection keeps SAP's answer, marked `sessionLost`
 * (connection 23, #354; a stateful request still rejects `SESSION_REPLACED`),
 * nothing retried; the connection is spent from then on,
 * so the next call logs on again and runs on the new session, and the
 * replaced connection is ended. The session that replaced the old one is
 * logged off before its cookies are dropped (connection 18.0.1), so SAP is
 * left no session of the replaced connection.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
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
} from '../../../../src/__tests__/helpers/adtStandIn';
import type { IDestinations } from '../auth/IAuthBrokerFactory.js';
import { StdioServer } from '../StdioServer.js';

let standIn: AdtStandIn;

beforeEach(async () => {
  mock.method(process.stderr, 'write', () => true);
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  standIn = await adtStandIn();
});

afterEach(async () => {
  await standIn.close();
  mock.restoreAll();
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

it("stdio: a stateless call that meets a session SAP replaced keeps SAP's answer and logs off the replacing session; the next call logs on again, runs on the new session, and the replaced connection is ended", async (t) => {
  // Every disconnect() of the real connector, with the instance it ended.
  const disconnect = t.mock.method(AdtOnPremConnector.prototype, 'disconnect');
  const { server, client, call } = await serveAtStart();
  let closed = false;
  try {
    const logons = () =>
      standIn.requests.filter((r) => r.url === '/sap/bc/adt/core/discovery')
        .length;
    // The start logged on once.
    assert.equal(logons(), 1);
    assert.deepStrictEqual(await call('one'), { text: 'one', isError: false });
    const first = sessionOfProbe('one');
    assert.notEqual(first, undefined);

    // SAP ended the start's session: the next request on it lands in another.
    standIn.endSession(first as string);
    const replaced = await call('two');
    // connection 23 (#354): a stateless request keeps SAP's answer, marked
    // `sessionLost`; the instance is spent, and nothing is sent again.
    assert.deepStrictEqual(replaced, { text: 'two', isError: false });
    assert.equal(
      standIn.requests.filter((r) => r.url === `${PROBE_PATH}two`).length,
      1,
    );
    assert.equal(logons(), 1);
    // The probe landed in a session SAP opened for it.
    const replacing = sessionOfProbe('two');
    assert.notEqual(replacing, undefined);
    assert.notEqual(replacing, first);

    // The next call logs on again and runs on the new session.
    assert.deepStrictEqual(await call('three'), {
      text: 'three',
      isError: false,
    });
    assert.equal(logons(), 2);
    const third = sessionOfProbe('three');
    assert.notEqual(third, undefined);
    assert.notEqual(third, first);
    assert.notEqual(third, sessionOfProbe('two'));

    // The replaced connection is ended — once, and not the one in use.
    assert.equal(disconnect.mock.callCount(), 1);
    const retired = disconnect.mock.calls[0]?.this as AdtOnPremConnector;
    assert.equal(retired.isConnected(), false);

    await client.close();
    await server.terminalClose();
    closed = true;
    // The replacement ends at the instance's close, with its logoff. The
    // session that replaced the old one was logged off once, by the
    // connection when it raised the loss (connection 18.0.1, the answer not
    // awaited there); the replaced connection's disconnect() wrote no second
    // one, its cookies already dropped.
    assert.equal(disconnect.mock.callCount(), 2);
    assert.notEqual(disconnect.mock.calls[1]?.this, retired);
    assert.deepStrictEqual(standIn.loggedOff(), [replacing, third]);
  } finally {
    if (!closed) {
      await client.close();
      await server.terminalClose();
    }
  }
});
