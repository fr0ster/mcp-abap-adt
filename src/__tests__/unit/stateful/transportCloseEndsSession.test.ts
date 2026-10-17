/**
 * The transport's close and the session's end. By default (stdio, an SSE
 * stream, an embedder's connected transport) the transport's close is the
 * session's end — the instance's close: its connection is logged off, every
 * live call's signal aborts, and a call still waiting before its tool — here
 * its system lookup — never reaches it. A host with a
 * transport per request (Streamable HTTP) states `transportCloseEndsSession:
 * false`: the transport's close ends no call, and the waiting call runs its
 * tool once.
 */

import { TokenAuthProvider } from '@mcp-abap-adt/auth-providers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { activeTools, isLatched } from '../../../lib/activeTools';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { ownedConnections } from '../../../lib/ownedConnections';
import {
  type AdtStandIn,
  adtStandIn,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { StandServer, silent, until } from '../backgroundRuns/harness';
import { oneToolGroup } from './harness';

jest.setTimeout(30_000);

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');
const of = (name: string) => (r: StandInRequest) =>
  r.url.toLowerCase().includes(name.toLowerCase());

/** A real short wait: long enough for a send that is not held back to arrive. */
const settleWhile = () => new Promise((resolve) => setTimeout(resolve, 150));

let previousType: string | undefined;
let standIn: AdtStandIn;
beforeEach(async () => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  standIn = await adtStandIn();
  standIn.body(
    isLookup,
    JSON.stringify({ userName: 'TOKEN_USER', systemID: 'CLD' }),
  );
});
afterEach(async () => {
  await standIn.close();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

async function stand(transportCloseEndsSession: boolean | undefined) {
  const server = new StandServer({
    name: 'transport-close',
    logger: silent,
    systemType: 'cloud',
    ...(transportCloseEndsSession !== undefined && {
      transportCloseEndsSession,
    }),
  });
  server.use({
    settings: { url: standIn.url, client: '100', authType: 'jwt' },
    credential: TokenAuthProvider.fixed('placeholder.token.sig'),
  });
  server.register(new CompositeHandlersRegistry([oneToolGroup('GetClass')]));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'transport-close', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const call = client
    .callTool({ name: 'GetClass', arguments: { class_name: 'ZCL_WAITS' } })
    .catch(() => 'the transport closed');
  return { server, client, call };
}

const live = () => activeTools().filter((tool) => tool.name === 'GetClass');

it.each([
  ['by default', undefined],
  ['stated true', true],
])(
  '%s the transport’s close ends the session: the instance’s close — its connection logged off, the waiting call’s signal aborts and its tool never runs',
  async (_label, option) => {
    // Nothing here closes the instance but the transport.
    const s = await stand(option);
    const held = standIn.hold(isLookup);
    await held.arrived;
    expect(ownedConnections(s.server)).toHaveLength(1);
    await s.client.close();
    expect(isLatched(s.server)).toBe(true);
    expect(ownedConnections(s.server)).toEqual([]);
    expect(await s.call).toBe('the transport closed');
    await until(() => standIn.logoffs() === 1);
    await settleWhile();
    expect(live()).toHaveLength(1);
    expect(live().every((tool) => tool.signal.aborted)).toBe(true);
    held.release();
    await until(() => live().length === 0);
    await settleWhile();
    expect(standIn.requests.some(of('ZCL_WAITS'))).toBe(false);
    expect(standIn.logoffs()).toBe(1);
  },
);

it('stated false (a transport per request): the transport’s close ends no call — the waiting call runs its tool once', async () => {
  const s = await stand(false);
  try {
    const held = standIn.hold(isLookup);
    await held.arrived;
    await s.client.close();
    // Nothing closed: the instance is open, its connection still its own.
    expect(isLatched(s.server)).toBe(false);
    expect(ownedConnections(s.server)).toHaveLength(1);
    expect(await s.call).toBe('the transport closed');
    await settleWhile();
    expect(live()).toHaveLength(1);
    expect(live().every((tool) => !tool.signal.aborted)).toBe(true);
    held.release();
    await until(() => live().length === 0);
    // The tool ran once: its source read reached the system once.
    expect(
      standIn.requests.filter((r) =>
        r.url.toLowerCase().includes('zcl_waits/source/main'),
      ),
    ).toHaveLength(1);
    expect(standIn.requests.findIndex(of('ZCL_WAITS'))).toBeGreaterThan(
      standIn.requests.findIndex(isLookup),
    );
    expect(standIn.logoffs()).toBe(0);
  } finally {
    // Cleanup only: this case's subject is a close that ends nothing.
    await s.server.terminalClose();
  }
});
